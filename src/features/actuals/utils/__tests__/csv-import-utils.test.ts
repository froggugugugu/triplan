import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import {
  buildImportPlan,
  type CsvColumnMapping,
  convertToManMonths,
  type ImportContext,
  resolvePeriodToMonth,
  suggestColumnMapping,
} from '../csv-import-utils'

const NOW = '2025-04-01T00:00:00.000Z'

const MEMBER_A_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_B_ID = '00000000-0000-4000-8000-0000000000b1'
const MEMBER_C_ID = '00000000-0000-4000-8000-0000000000c1'
const ROOT_ID = '00000000-0000-4000-8000-00000000d001'
const TASK_1_ID = '00000000-0000-4000-8000-00000000d011'
const TASK_2_ID = '00000000-0000-4000-8000-00000000d012'
const SINGLE_ROOT_ID = '00000000-0000-4000-8000-00000000d002'
const SINGLE_TASK_ID = '00000000-0000-4000-8000-00000000d021'
const ASSIGNMENT_ID = '00000000-0000-4000-8000-00000000e001'

function buildMember(overrides: Partial<Member> & { id: string }): Member {
  return {
    name: 'メンバー',
    email: null,
    sectionId: null,
    role: '',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Member
}

function buildProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    code: 'P001',
    name: 'プロジェクト',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Project
}

const MEMBERS = [
  buildMember({
    id: MEMBER_A_ID,
    name: '山田太郎',
    email: 'Taro.Yamada@example.com',
  }),
  buildMember({ id: MEMBER_B_ID, name: '佐藤花子' }),
  buildMember({ id: MEMBER_C_ID, name: '佐藤花子' }), // 同名（email無し）
]

const PROJECTS = [
  buildProject({ id: ROOT_ID, code: 'P100', name: '基幹刷新' }),
  buildProject({
    id: TASK_1_ID,
    code: 'P100-01',
    name: '設計',
    parentId: ROOT_ID,
    level: 1,
  }),
  buildProject({
    id: TASK_2_ID,
    code: 'P100-02',
    name: '実装',
    parentId: ROOT_ID,
    level: 1,
  }),
  buildProject({ id: SINGLE_ROOT_ID, code: 'P200', name: '保守運用' }),
  buildProject({
    id: SINGLE_TASK_ID,
    code: 'P200-01',
    name: '定常保守',
    parentId: SINGLE_ROOT_ID,
    level: 1,
  }),
]

const ASSIGNMENTS: AssignmentEntry[] = [
  {
    id: ASSIGNMENT_ID,
    projectId: ROOT_ID,
    taskId: TASK_1_ID,
    memberId: MEMBER_A_ID,
    monthlyValues: { '2025-09': 0.5 },
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const MAPPING: CsvColumnMapping = {
  member: 0,
  project: 1,
  task: 2,
  period: 3,
  value: 4,
}

function buildCtx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    members: MEMBERS,
    projects: PROJECTS,
    assignments: ASSIGNMENTS,
    workdaysPerMonth: 20,
    hoursPerDay: 8,
    ...overrides,
  }
}

describe('suggestColumnMapping', () => {
  it('日本語ヘッダから各役割を推定する', () => {
    expect(
      suggestColumnMapping([
        'メールアドレス',
        '案件コード',
        'タスク',
        '年月',
        '工数（人日）',
      ]),
    ).toEqual({ member: 0, project: 1, task: 2, period: 3, value: 4 })
  })

  it('英語ヘッダからも推定する', () => {
    expect(suggestColumnMapping(['email', 'project', 'date', 'hours'])).toEqual(
      { member: 0, project: 1, period: 2, value: 3 },
    )
  })

  it('反証: 同じ列を複数の役割に割り当てない', () => {
    const mapping = suggestColumnMapping(['担当者', 'プロジェクト'])
    const values = Object.values(mapping)
    expect(new Set(values).size).toBe(values.length)
  })

  it('推定できない役割はキー自体を持たない', () => {
    expect(suggestColumnMapping(['xyz', 'abc'])).toEqual({})
  })
})

describe('resolvePeriodToMonth', () => {
  it('YYYY-MM / YYYY/MM を月キーへ解決する', () => {
    expect(resolvePeriodToMonth('2025-09')).toBe('2025-09')
    expect(resolvePeriodToMonth('2025/9')).toBe('2025-09')
  })

  it('日付（YYYY-MM-DD / YYYY/MM/DD）は属する月へ丸める', () => {
    expect(resolvePeriodToMonth('2025-09-16')).toBe('2025-09')
    expect(resolvePeriodToMonth('2025/9/1')).toBe('2025-09')
  })

  it('反証: 解釈できない形式・範囲外の月/日はnull', () => {
    for (const raw of ['2025', '2025-13', '2025-00', '2025-09-32', 'abc', '']) {
      expect(resolvePeriodToMonth(raw)).toBeNull()
    }
  })
})

describe('convertToManMonths', () => {
  it('人月はそのまま、人日はworkdaysPerMonthで、時間はhoursPerDay×workdaysPerMonthで換算する', () => {
    expect(convertToManMonths(0.5, 'manMonth', 20, 8)).toBe(0.5)
    expect(convertToManMonths(10, 'manDay', 20, 8)).toBe(0.5)
    expect(convertToManMonths(80, 'hour', 20, 8)).toBe(0.5)
  })

  it('設定値の変更が換算へ反映される（workdaysPerMonth=16、hoursPerDay=7.5）', () => {
    expect(convertToManMonths(8, 'manDay', 16, 7.5)).toBe(0.5)
    expect(convertToManMonths(60, 'hour', 16, 7.5)).toBe(0.5)
  })

  it('0.01刻みへ丸める', () => {
    // 7人日/20 = 0.35、1人日/3... ではなく端数ケース: 1/3人月相当
    expect(convertToManMonths(6.7, 'manDay', 20, 8)).toBe(0.34)
  })
})

describe('buildImportPlan', () => {
  it('email一致（大文字小文字無視）でメンバーを解決し、既存アサインは上書き候補になる', () => {
    const plan = buildImportPlan(
      [['taro.yamada@EXAMPLE.com', 'P100', 'P100-01', '2025-09', '0.8']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0]).toMatchObject({
      memberId: MEMBER_A_ID,
      assignmentId: ASSIGNMENT_ID,
      month: '2025-09',
      value: 0.8,
      planned: 0.5,
    })
    expect(plan.overrideCount).toBe(1)
    expect(plan.unplannedCount).toBe(0)
  })

  it('氏名フォールバックで解決し、既存アサインが無ければ計画外の新規になる', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '実装', '2025-09', '0.3']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]).toMatchObject({
      memberId: MEMBER_A_ID,
      taskId: TASK_2_ID,
      assignmentId: null,
      planned: 0,
    })
    expect(plan.unplannedCount).toBe(1)
  })

  it('反証: 同名のメンバーが複数いる場合はスキップする（誤帰属の防止）', () => {
    const plan = buildImportPlan(
      [['佐藤花子', 'P100', 'P100-01', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skips).toHaveLength(1)
    expect(plan.skips[0]?.row).toBe(2)
    expect(plan.skips[0]?.reason).toContain('同名のメンバーが複数')
  })

  it('プロジェクトは名称でも解決できる', () => {
    const plan = buildImportPlan(
      [['山田太郎', '基幹刷新', 'P100-01', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]?.projectId).toBe(ROOT_ID)
  })

  it('タスク列が空でもリーフが1件の案件は自動解決される', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P200', '', '2025-09', '0.2']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]?.taskId).toBe(SINGLE_TASK_ID)
  })

  it('反証: タスク列が空で複数タスクの案件はスキップする（要タスク指定）', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('タスクを特定できません')
  })

  it('日次の行は人×プロジェクト×タスク×月へ合算され、換算・丸めは合算後に行う', () => {
    // 3.5人日 + 3.5人日 = 7人日 → 0.35人月（行ごとに丸めると0.18+0.18=0.36になる反証）
    const plan = buildImportPlan(
      [
        ['山田太郎', 'P100', '設計', '2025-09-01', '3.5'],
        ['山田太郎', 'P100', '設計', '2025-09-15', '3.5'],
      ],
      MAPPING,
      'manDay',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0]?.value).toBe(0.35)
  })

  it('別の月・別のタスクは合算されない', () => {
    const plan = buildImportPlan(
      [
        ['山田太郎', 'P100', '設計', '2025-09', '0.3'],
        ['山田太郎', 'P100', '設計', '2025-10', '0.4'],
        ['山田太郎', 'P100', '実装', '2025-09', '0.2'],
      ],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(3)
    expect(plan.targetMonths).toEqual(['2025-09', '2025-10'])
  })

  it('per-row skip: 解決できない行をスキップしても解決できた行は候補に残る', () => {
    const plan = buildImportPlan(
      [
        ['山田太郎', 'P100', '設計', '2025-09', '0.5'],
        ['存在しない人', 'P100', '設計', '2025-09', '0.5'],
        ['山田太郎', 'P999', '設計', '2025-09', '0.5'],
        ['山田太郎', 'P100', '存在しないタスク', '2025-09', '0.5'],
        ['山田太郎', 'P100', '設計', 'いつか', '0.5'],
        ['山田太郎', 'P100', '設計', '2025-09', 'たくさん'],
      ],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(1)
    expect(plan.skips).toHaveLength(5)
    // 行番号はヘッダ=1行目としてデータ行が2始まり
    expect(plan.skips.map((s) => s.row)).toEqual([3, 4, 5, 6, 7])
  })

  it('反証: 0値の行は「実働ゼロの明示」として候補に残る（スキップしない）', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09', '0']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]?.value).toBe(0)
  })

  it('反証: 1.0人月超の値もブロックしない（実績は事実の記録）', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09', '1.5']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]?.value).toBe(1.5)
  })

  it('取込値合計と計画合計（乖離表示用）を集計する', () => {
    const plan = buildImportPlan(
      [
        ['山田太郎', 'P100', '設計', '2025-09', '0.8'],
        ['山田太郎', 'P100', '実装', '2025-09', '0.2'],
      ],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.totalValue).toBe(1.0)
    // 設計タスクのみ既存アサイン（計画0.5）、実装は計画外（0）
    expect(plan.totalPlanned).toBe(0.5)
  })

  it('task列をマッピングしない（undefined）場合も単一タスク案件は解決できる', () => {
    const mappingWithoutTask: CsvColumnMapping = {
      member: 0,
      project: 1,
      period: 2,
      value: 3,
    }
    const plan = buildImportPlan(
      [['山田太郎', 'P200', '2025-09', '0.4']],
      mappingWithoutTask,
      'manMonth',
      buildCtx(),
    )
    expect(plan.skips).toEqual([])
    expect(plan.candidates[0]?.taskId).toBe(SINGLE_TASK_ID)
  })
})

describe('buildImportPlan: 締め済み月のスキップ（P1-b月次締めハードロック）', () => {
  it('反証: 締め済み月の行だけスキップされ、他月の行は適用される（per-row skip）', () => {
    const plan = buildImportPlan(
      [
        ['山田太郎', 'P100', '設計', '2025-09', '0.5'],
        ['山田太郎', 'P100', '設計', '2025-10', '0.4'],
      ],
      MAPPING,
      'manMonth',
      buildCtx({ closedMonths: new Set(['2025-09']) }),
    )
    expect(plan.candidates).toHaveLength(1)
    expect(plan.candidates[0]?.month).toBe('2025-10')
    expect(plan.skips).toHaveLength(1)
    expect(plan.skips[0]?.reason).toContain('締め済みの月です')
  })

  it('日次行も月へ丸めた後の判定で締め済み月ならスキップされる', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09-15', '3.5']],
      MAPPING,
      'manDay',
      buildCtx({ closedMonths: new Set(['2025-09']) }),
    )
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('2025-09')
  })

  it('反証: closedMonths未指定（後方互換）ではスキップしない', () => {
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx(),
    )
    expect(plan.candidates).toHaveLength(1)
    expect(plan.skips).toHaveLength(0)
  })
})

describe('buildImportPlan: 複数一致skip（の水平展開・誤帰属防止）', () => {
  it('反証: プロジェクトコードが重複している場合はskipし、どちらにも帰属させない', () => {
    const dupProjects = [
      ...PROJECTS,
      buildProject({
        id: '00000000-0000-4000-8000-00000000d999',
        code: 'P100', // ROOTと重複
        name: '重複コードプロジェクト',
      }),
    ]
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx({ projects: dupProjects }),
    )
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('候補が複数')
  })

  it('反証: タスク名が重複している場合もskipする', () => {
    const dupProjects = [
      ...PROJECTS,
      buildProject({
        id: '00000000-0000-4000-8000-00000000d998',
        code: 'P100-99',
        name: '設計', // TASK_1と同名
        parentId: ROOT_ID,
        level: 1,
      }),
    ]
    const plan = buildImportPlan(
      [['山田太郎', 'P100', '設計', '2025-09', '0.5']],
      MAPPING,
      'manMonth',
      buildCtx({ projects: dupProjects }),
    )
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skips[0]?.reason).toContain('候補が複数')
  })
})
