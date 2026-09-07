import type { Project, ProjectLevel } from '@/shared/types'

/**
 * 案件コードを自動生成する
 *
 * - レベル0（案件）: P001, P002, ...
 * - レベル1〜4: 親コード-01, 親コード-02, ...（2桁）
 * - レベル5: 親コード-001, 親コード-002, ...（3桁）
 */
export function generateProjectCode(
  level: ProjectLevel,
  existingProjects: Pick<Project, 'code' | 'level' | 'parentId'>[],
  parentId: string | null,
  parentCode?: string,
): string {
  if (level === 0) {
    const codes = existingProjects
      .filter((p) => p.level === 0)
      .map((p) => {
        const match = p.code.match(/^P(\d{3})$/)
        return match?.[1] ? Number.parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)

    const nextNum = codes.length > 0 ? Math.max(...codes) + 1 : 1
    return `P${nextNum.toString().padStart(3, '0')}`
  }

  if (!parentCode)
    return `P000${'-00'.repeat(level - 1)}-${level >= 5 ? '001' : '01'}`

  const isLastLevel = level >= 5
  const digits = isLastLevel ? 3 : 2
  const regex = isLastLevel ? /(\d{3})$/ : /(\d{2})$/

  const codes = existingProjects
    .filter((p) => p.level === level && p.parentId === parentId)
    .map((p) => {
      const match = p.code.match(regex)
      return match?.[1] ? Number.parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)

  const nextNum = codes.length > 0 ? Math.max(...codes) + 1 : 1
  return `${parentCode}-${nextNum.toString().padStart(digits, '0')}`
}
