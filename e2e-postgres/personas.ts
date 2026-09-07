import { expect, type Page } from '@playwright/test'

/**
 * ペルソナ定義（非公開の設計文書）。
 *
 * 「サーバーが403を返す」ことと「その403を受けた画面がまともに動く」ことは別問題なので、
 * ロールごとに**実際の画面を通した一連の業務**を検証する。
 */

export interface Persona {
  key: 'admin' | 'manager' | 'editor' | 'viewer' | 'partner'
  /** 仮名（テスト名に出る） */
  name: string
  /** 立場（何をしたい人か） */
  role: string
  email: string
  password: string
}

export const PERSONAS: Record<Persona['key'], Persona> = {
  admin: {
    key: 'admin',
    name: '佐藤',
    role: '情報システム管理者',
    email: 'admin@e2e.local',
    password: 'E2eAdminPass123',
  },
  manager: {
    key: 'manager',
    name: '田中',
    role: 'PM／部門長',
    email: 'manager@e2e.local',
    password: 'E2eManagerPass123',
  },
  editor: {
    key: 'editor',
    name: '鈴木',
    role: '開発リーダー',
    email: 'editor@e2e.local',
    password: 'E2eEditorPass123',
  },
  viewer: {
    key: 'viewer',
    name: '山本',
    role: '経営企画',
    email: 'viewer@e2e.local',
    password: 'E2eViewerPass123',
  },
  partner: {
    key: 'partner',
    name: '高橋',
    role: '協力会社のPM',
    email: 'partner@e2e.local',
    password: 'E2ePartnerPass123',
  },
}

/** ログインしてダッシュボードが出るまで待つ */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(persona.email)
  await page.getByLabel('パスワード').fill(persona.password)
  await page.getByRole('button', { name: /ログイン/ }).click()
  await expect(
    page.getByRole('heading', { name: 'ダッシュボード' }),
  ).toBeVisible({ timeout: 20000 })
}

/**
 * 表示されたトーストを記録し始める。**各テストの最初（ログイン前）に一度呼ぶ**。
 *
 * 「エラートーストが出ないこと」の検証は素朴に書くと成立しない。実測した理由は2つ:
 * ①shadcn/uiのToastはRadixの`<ol>`/`<li>`として描画され`role="status"`が付かない
 * ②**トーストは約5秒で自動的に消える**ため、「待ってから存在しないことを確認する」形だと
 * 消えた後を見て通ってしまう（修正前でも通る偽陰性を実際に踏んだ）。
 *
 * そこでMutationObserverで出現を記録する。`addInitScript`はナビゲーションのたびに
 * 実行されるため、画面遷移をまたいでも記録が継続する。
 */
export async function installToastRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = []
    ;(window as unknown as { __toastLog: string[] }).__toastLog = log
    const scan = () => {
      for (const li of document.querySelectorAll('ol li')) {
        const text = li.textContent?.trim() ?? ''
        if (text && !log.includes(text)) log.push(text)
      }
    }
    const start = () => {
      scan()
      new MutationObserver(scan).observe(document.body, {
        childList: true,
        subtree: true,
      })
    }
    if (document.body) start()
    else document.addEventListener('DOMContentLoaded', start)
  })
}

/**
 * 記録されたトーストにエラー通知が含まれていないことを確認する。
 *
 * partnerがダッシュボードを開くと金額系7エンティティ＋ベースラインが403になり
 * 「予算情報の読み込みに失敗しました」が出る、という実バグの回帰テスト。
 */
export async function expectNoErrorToast(page: Page): Promise<void> {
  // 読み込みレスポンスが出揃ってトーストが描画されるまでの猶予
  await page.waitForTimeout(1500)
  const recorded = await page.evaluate(
    () => (window as unknown as { __toastLog?: string[] }).__toastLog ?? [],
  )
  const errors = recorded.filter((t) => /失敗しました|権限がありません/.test(t))
  expect(errors, `エラートーストが表示された: ${errors.join(' / ')}`).toEqual(
    [],
  )
}

/**
 * ナビゲーション中に403が発生しなかったことを確認するための収集を開始する。
 *
 * トーストの有無は描画タイミングに左右されるが、403レスポンスの有無は決定論的なので、
 * 「そのロールが見えないデータを読みにいっていないか」はこちらで見るほうが確実。
 * 返り値の関数を呼ぶと、それまでに観測した403のURL一覧が得られる。
 */
export function collectForbiddenResponses(page: Page): () => string[] {
  const forbidden: string[] = []
  page.on('response', (res) => {
    if (res.status() === 403) {
      forbidden.push(new URL(res.url()).pathname)
    }
  })
  return () => [...new Set(forbidden)]
}

/** サイドバーに指定名のリンクが出ているか */
export function navLink(page: Page, name: string | RegExp) {
  return page.getByRole('link', { name })
}
