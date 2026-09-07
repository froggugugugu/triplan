import { ApiError } from '@/infrastructure/adapters/authenticated-fetch'

/**
 * 失敗が「そのロールに権限が無いだけ」かを判定する。
 *
 * postgresモードのサーバーは、金額系エンティティのGETに`financials:read`を、
 * 書き込みに`data:write`を要求する（多層防御の実体）。そのため閲覧専用のロール
 * （`partner`・`viewer`）では、**利用者が何も操作していないのに**403になる経路がある:
 *
 * - 画面を開いたときの読み込み（partnerの金額系エンティティ＝1画面あたり403が60回）
 * - マウント時の自動シード（WBSテンプレート・ドキュメントテンプレート）
 *
 * これらを他の失敗と同列にトースト通知すると、**画面を開くたびに意味不明な警告が出る**
 * （UIは既に該当セクションを隠しているため、利用者には何のことか分からない）。
 * 自分が起こしていない操作の権限エラーは、状態を空のままにして静かに諦める。
 *
 * **利用者が明示的に行った操作の403は通知する**（viewerが編集を試みた等、
 * 結果を知るべき操作のため）。呼び出し側で使い分けること。
 */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

/**
 * 失敗が「他のユーザーが先に更新した」（楽観ロックの競合）かを判定する。
 *
 * サーバーはunique制約違反（409）と区別できるよう412 Precondition Failedを返す。
 * 競合は障害ではなく**正常な並行編集の結果**なので、
 * 「保存に失敗しました」ではなく再読込を促す文言を出す。
 */
export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412
}

/**
 * 失敗が「localStorageの容量上限に達した」かを判定する。
 *
 * localモードは全業務データを単一キーへJSONで持つため、規模が大きくなると
 * ブラウザの上限（一般に5MB前後）に達する。実測では**約20案件×100タスクで1.9MB、
 * 50案件×200タスクで9.6MB**と上限を超える。
 *
 * 上限に達すると`localStorage.setItem`がDOMExceptionを投げ、楽観的更新は
 * ロールバックされる（データは壊れない）。ただし素のエラーメッセージでは
 * 「なぜ保存できないのか」が利用者に伝わらないため、専用の案内を出す。
 */
export function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // ブラウザによって名称が異なる（Firefoxは NS_ERROR_DOM_QUOTA_REACHED）
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  )
}

/**
 * 保存失敗時のトースト説明文を組み立てる。
 * 競合（412）と容量上限だけは原因と次の行動が違うため文言を差し替え、それ以外は
 * 呼び出し側が渡した内容（多くはerror.message）をそのまま返す
 * （独自の定型文を足すと、本物の障害の原因表示を覆い隠してしまう）。
 */
export function describeSaveFailure(
  error: unknown,
  fallback: string | undefined,
): string | undefined {
  if (isConflictError(error)) {
    return '他のユーザーが先に更新しました。画面を再読み込みして最新の内容を確認してください'
  }
  if (isStorageQuotaError(error)) {
    return 'ブラウザの保存容量が上限に達しました。変更は取り消されています。不要なスナップショットの削除、JSONエクスポートでの退避、またはPostgreSQLモードへの移行を検討してください'
  }
  return fallback
}
