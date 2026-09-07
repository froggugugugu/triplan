import type { ExternalToolConnectionRow } from '../db/schema.js'
import type { ExternalTool } from '../external-tools/config.js'

/**
 * 外部ツール接続の実アカウント検証CLI。
 *
 * 統合テストは外部APIをfetchスタブ化しているため、**実APIとの相性（認証ヘッダ・
 * 送信形式・レスポンス構造）は本スクリプトでしか検証できない**。
 * DBもサーバー起動も不要で、本番と同じ`client.ts`/`payload.ts`を直接叩く。
 *
 * 使い方（トークンは環境変数で渡す。引数に書くとシェル履歴へ残るため避ける）:
 *   EXT_TOOL=github EXT_TOKEN=xxx EXT_TARGET='{"owner":"me","repo":"test"}' \
 *     npm --prefix server run verify:external-tool
 *
 *   # 実際にIssueを1件作って外部IDの形式まで確認する（テスト用リポジトリで）
 *   ... EXT_CREATE=1 npm --prefix server run verify:external-tool
 *
 * 環境変数:
 *   EXT_TOOL    backlog | asana | jira | github
 *   EXT_TOKEN   APIトークン（画面へは出力しない）
 *   EXT_BASE_URL  Backlog=スペースURL / Jira=サイトURL（他は不要）
 *   EXT_EMAIL   Jiraのみ（APIトークンと対のメールアドレス）
 *   EXT_TARGET  起票先のJSON（例: {"owner":"me","repo":"test"}）。省略時は接続テストのみ
 *   EXT_CREATE  1なら実際に1件起票する（既定は起票しない）
 */

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/** トークンなど秘匿値をそのまま出力しないための伏字（長さだけ示す） */
function mask(value: string): string {
  return `${value.slice(0, 4)}…(${value.length}文字)`
}

async function main(): Promise<void> {
  // env.tsはモジュール読み込み時にzod検証してprocess.exitするため、DBを使わない
  // 本スクリプト用にダミー値を先に埋めてから動的importする（統合テストと同じ手法）。
  // 実際の.envがあればそちらが優先される（??=は未設定時のみ代入）
  process.env.DATABASE_URL ??= 'postgres://verify:verify@localhost:5432/verify'
  process.env.JWT_ACCESS_SECRET ??= 'verify-only-not-used-secret'
  process.env.JWT_REFRESH_PEPPER ??= 'verify-only-not-used-pepper'
  process.env.SSO_ENCRYPTION_KEY ??= '0'.repeat(64)

  const { encryptSecret } = await import('../auth/crypto.js')
  const { callToolApi, fetchToolMetadata } = await import(
    '../external-tools/client.js'
  )
  const { EXTERNAL_TOOLS, parseTargetConfig, validateConnectionInput } =
    await import('../external-tools/config.js')
  const {
    buildAddToSectionRequest,
    buildCreatePayload,
    buildGroupCreateRequest,
    buildGroupListRequest,
    extractCreatedGroupId,
    extractExternalId,
    extractGroupId,
  } = await import('../external-tools/payload.js')

  const tool = process.env.EXT_TOOL as ExternalTool | undefined
  const token = process.env.EXT_TOKEN
  if (!tool || !EXTERNAL_TOOLS.includes(tool)) {
    fail(
      `EXT_TOOL は ${EXTERNAL_TOOLS.join(' | ')} のいずれかを指定してください`,
    )
  }
  if (!token) fail('EXT_TOKEN が未設定です')

  const baseUrl = process.env.EXT_BASE_URL?.trim() || null
  const authEmail = process.env.EXT_EMAIL?.trim() || null

  const inputError = validateConnectionInput(tool, { baseUrl, authEmail })
  if (inputError) fail(`接続設定が不正です: ${inputError}`)

  let targetConfig: Record<string, unknown> | null = null
  if (process.env.EXT_TARGET) {
    try {
      targetConfig = parseTargetConfig(
        tool,
        JSON.parse(process.env.EXT_TARGET),
      ) as Record<string, unknown> | null
    } catch (error) {
      fail(
        `EXT_TARGET が不正です: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // 本番と同じ経路（暗号化列からの復号）を通すため、DB行と同じ形を組み立てる
  const connection: ExternalToolConnectionRow = {
    id: '00000000-0000-4000-8000-000000000000',
    tool,
    name: 'verify-cli',
    baseUrl,
    authEmail,
    apiTokenEncrypted: encryptSecret(token),
    targetConfig,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  console.log('=== 外部ツール接続の実アカウント検証 ===')
  console.log(`ツール      : ${tool}`)
  console.log(`URL         : ${baseUrl ?? '(固定ホスト)'}`)
  console.log(`メール      : ${authEmail ?? '(不要)'}`)
  console.log(`トークン    : ${mask(token)}`)
  console.log(
    `起票先      : ${targetConfig ? JSON.stringify(targetConfig) : '(未指定)'}`,
  )
  console.log('')

  // ① 接続テスト（画面の「接続テスト」ボタンと同一経路）
  const testPath =
    tool === 'backlog'
      ? '/api/v2/users/myself'
      : tool === 'jira'
        ? '/rest/api/3/myself'
        : tool === 'asana'
          ? '/users/me'
          : targetConfig?.owner
            ? `/repos/${targetConfig.owner}/${targetConfig.repo}`
            : '/user'
  const test = await callToolApi(connection, testPath)
  console.log(
    test.ok
      ? `① 接続テスト  : OK (HTTP ${test.status})`
      : `① 接続テスト  : NG ${test.detail ?? ''}`,
  )
  if (!test.ok) {
    console.error('  → トークン・URL・権限を確認してください')
    process.exit(1)
  }

  // ② 起票先の選択肢取得（画面の起票先設定ダイアログと同一経路）
  const metadata = await fetchToolMetadata(connection)
  if (metadata.ok) {
    const projects = metadata.data?.projects ?? []
    console.log(
      `② 選択肢取得  : OK（プロジェクト${projects.length}件${
        projects.length > 0
          ? ` 例: ${projects
              .slice(0, 3)
              .map((p) => `${p.name}(id=${p.id})`)
              .join(', ')}`
          : ''
      }）`,
    )
    const priorities = metadata.data?.priorities ?? []
    if (priorities.length > 0) {
      console.log(
        `   優先度      : ${priorities.map((p) => `${p.name}(id=${p.id})`).join(', ')}`,
      )
    }
    const issueTypes = metadata.data?.issueTypes ?? []
    if (issueTypes.length > 0) {
      console.log(
        `   課題種別    : ${issueTypes
          .slice(0, 8)
          .map((t) => `${t.name}(id=${t.id})`)
          .join(', ')}`,
      )
    } else if (tool === 'backlog' && !targetConfig) {
      console.log(
        '   課題種別    : (EXT_TARGETでprojectIdを指定すると一覧を表示します)',
      )
    }
  } else {
    console.log(`② 選択肢取得  : NG ${metadata.detail ?? ''}`)
  }

  if (!targetConfig) {
    console.log('')
    console.log('EXT_TARGET 未指定のため起票の検証はスキップしました。')
    console.log(
      '上の「選択肢取得」で出たIDを使ってEXT_TARGETを組み立ててください。',
    )
    return
  }

  if (process.env.EXT_CREATE !== '1') {
    console.log('')
    console.log('③ 起票        : スキップ（EXT_CREATE=1 で実行します）')
    console.log(
      '   ※ 実際に外部ツールへタスクが1件作成されます。テスト用の場所で実行してください',
    )
    return
  }

  // ③ 実起票（テスト用タスクを1件作る）。起票内容は本番と同一の組み立て
  const target = {
    id: 'verify',
    code: 'VERIFY-01',
    name: '接続検証タスク（削除して構いません）',
    completionCriteria: 'triplanのAPI起票検証で作成されました',
    group: '接続検証',
    // 期日つきで送れるか（実APIが受理するか）も検証対象に含める。
    // 実運用では所属工程のスケジュール終了日が入る
    dueDate: process.env.EXT_DUE_DATE ?? null,
  }

  let groupId: string | null = null
  const listReq = buildGroupListRequest(tool, targetConfig)
  if (listReq) {
    const list = await callToolApi(connection, listReq.path)
    if (list.ok) {
      groupId = extractGroupId(tool, list.data, target.group)
      if (!groupId) {
        const createReq = buildGroupCreateRequest(
          tool,
          targetConfig,
          target.group,
        )
        if (createReq) {
          const created = await callToolApi(connection, createReq.path, {
            method: 'POST',
            body: createReq.body,
            encoding: createReq.encoding,
          })
          groupId = created.ok
            ? extractCreatedGroupId(tool, created.data)
            : null
          console.log(
            created.ok
              ? `   グループ作成: OK (id=${groupId})`
              : `   グループ作成: NG ${created.detail ?? ''}`,
          )
        }
      } else {
        console.log(`   グループ解決: 既存を使用 (id=${groupId})`)
      }
    } else {
      console.log(`   グループ一覧: NG ${list.detail ?? ''}`)
    }
  }

  const payload = buildCreatePayload(tool, targetConfig, target, groupId)
  const result = await callToolApi(connection, payload.path, {
    method: 'POST',
    body: payload.body,
    encoding: payload.encoding,
  })
  if (!result.ok) {
    console.log(`③ 起票        : NG ${result.detail ?? ''}`)
    process.exit(1)
  }
  const externalId = extractExternalId(tool, targetConfig, result.data)
  console.log(`③ 起票        : OK`)
  console.log(
    externalId
      ? `   外部ID      : ${externalId}（この形式でWebhook側と突合します）`
      : '   外部ID      : ✗ 取得できませんでした（レスポンス構造の確認が必要です）',
  )

  if (groupId && externalId) {
    const addReq = buildAddToSectionRequest(tool, groupId, externalId)
    if (addReq) {
      const added = await callToolApi(connection, addReq.path, {
        method: 'POST',
        body: addReq.body,
        encoding: addReq.encoding,
      })
      console.log(
        added.ok
          ? '   セクション  : OK（起票後の移動に成功）'
          : `   セクション  : NG ${added.detail ?? ''}`,
      )
    }
  }

  console.log('')
  console.log('検証完了。作成されたタスクは外部ツール側で削除して構いません。')
}

main().catch((error) => {
  console.error('予期しないエラー:', error)
  process.exit(1)
})
