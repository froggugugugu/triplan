/**
 * プロジェクト名に確度を付与して表示用文字列を生成
 * confidence が null の場合はプロジェクト名のみ返す
 */
export function formatProjectNameWithConfidence(
  name: string,
  confidence: string | null | undefined,
): string {
  return confidence ? `${name} (${confidence})` : name
}
