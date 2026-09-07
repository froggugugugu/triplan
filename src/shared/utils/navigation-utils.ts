/**
 * URLクエリパラメータと`location.state`の両方でプロジェクトIDが渡されうる画面
 * （WBS/スケジュール/アサイン各画面）で、どちらを優先して初期選択するかを決定論的に解決する。
 * クエリパラメータを優先し、無効/未指定の場合はlocation.stateへフォールバックする
 * （NFR-004: 3画面で優先順位を統一する）。
 */
export function resolveInitialProjectId(
  queryProjectId: string | null,
  stateProjectId: string | null,
  isValidProjectId: (id: string) => boolean,
): string {
  if (queryProjectId && isValidProjectId(queryProjectId)) {
    return queryProjectId
  }
  if (stateProjectId && isValidProjectId(stateProjectId)) {
    return stateProjectId
  }
  return ''
}
