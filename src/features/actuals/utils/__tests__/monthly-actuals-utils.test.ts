import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import {
  buildMonthlyActualsRows,
  deriveActualCellStatus,
  formatMonthLabel,
  getDefaultTargetMonth,
  type MonthlyActualsDetailRow,
  type MonthlyActualsMemberRow,
  shiftMonthKey,
  summarizeMonthlyActuals,
} from '../monthly-actuals-utils'

const MONTH = '2025-04'
const NOW = '2025-04-01T00:00:00.000Z'

const MEMBER_A_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_B_ID = '00000000-0000-4000-8000-0000000000b1'
const ROOT_ID = '00000000-0000-4000-8000-00000000c001'
const TASK_1_ID = '00000000-0000-4000-8000-00000000c011'
const TASK_2_ID = '00000000-0000-4000-8000-00000000c012'

function buildMember(overrides: Partial<Member> & { id: string }): Member {
  return {
    name: 'メンバー',
    sectionId: null,
    role: 'エンジニア',
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

function buildAssignment(
  overrides: Partial<AssignmentEntry> & { id: string },
): AssignmentEntry {
  return {
    projectId: ROOT_ID,
    taskId: TASK_1_ID,
    memberId: MEMBER_A_ID,
    monthlyValues: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as AssignmentEntry
}

const MEMBERS = [
  buildMember({ id: MEMBER_A_ID, name: 'あおき' }),
  buildMember({ id: MEMBER_B_ID, name: 'いしだ', capacityRatio: 0.5 }),
]

const PROJECTS = [
  buildProject({ id: ROOT_ID, code: 'P001', name: '基幹刷新' }),
  buildProject({
    id: TASK_1_ID,
    code: 'P001-01',
    name: '設計',
    parentId: ROOT_ID,
    level: 1,
  }),
  buildProject({
    id: TASK_2_ID,
    code: 'P001-02',
    name: '実装',
    parentId: ROOT_ID,
    level: 1,
  }),
]

function detailsOf(rows: ReturnType<typeof buildMonthlyActualsRows>) {
  return rows.filter((r): r is MonthlyActualsDetailRow => r.kind === 'detail')
}

function memberRowsOf(rows: ReturnType<typeof buildMonthlyActualsRows>) {
  return rows.filter((r): r is MonthlyActualsMemberRow => r.kind === 'member')
}

describe('deriveActualCellStatus', () => {
  it('キー欠落（undefined）は計画どおり', () => {
    expect(deriveActualCellStatus(undefined)).toBe('planned')
  })

  it('反証: 0は「実働ゼロの明示値」でありplannedではない', () => {
    expect(deriveActualCellStatus(0)).toBe('zeroActual')
  })

  it('0以外の明示値は上書き', () => {
    expect(deriveActualCellStatus(0.5)).toBe('overridden')
  })
})

describe('buildMonthlyActualsRows', () => {
  it('計画がある行が担当者グループ行つきで構築される', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          monthlyValues: { [MONTH]: 0.5 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.kind).toBe('member')
    const detail = detailsOf(rows)[0]
    expect(detail?.planned).toBe(0.5)
    expect(detail?.actual).toBeUndefined()
    expect(detail?.effectiveActual).toBe(0.5)
    expect(detail?.variance).toBe(0)
    expect(detail?.status).toBe('planned')
    expect(detail?.projectLabel).toBe('P001 基幹刷新')
    expect(detail?.taskName).toBe('設計')
  })

  it('反証: 計画0かつ実績なしの行は出力しない', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          monthlyValues: { '2025-05': 0.5 }, // 対象月ではない
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(rows).toHaveLength(0)
  })

  it('計画が無くても実績の明示入力があれば行を出力する（計画外実績）', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          monthlyValues: {},
          actualMonthlyValues: { [MONTH]: 0.3 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    const detail = detailsOf(rows)[0]
    expect(detail?.planned).toBe(0)
    expect(detail?.actual).toBe(0.3)
    expect(detail?.variance).toBeCloseTo(0.3)
    expect(detail?.status).toBe('overridden')
  })

  it('反証: 実績0の明示入力はeffectiveActual=0でzeroActual（計画値へフォールバックしない）', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          monthlyValues: { [MONTH]: 0.5 },
          actualMonthlyValues: { [MONTH]: 0 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    const detail = detailsOf(rows)[0]
    expect(detail?.effectiveActual).toBe(0)
    expect(detail?.variance).toBe(-0.5)
    expect(detail?.status).toBe('zeroActual')
  })

  it('担当者名→プロジェクト→タスク名順に整列し、担当者ごとにグループ行が入る', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e002',
          taskId: TASK_2_ID,
          memberId: MEMBER_B_ID,
          monthlyValues: { [MONTH]: 0.2 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          taskId: TASK_1_ID,
          memberId: MEMBER_A_ID,
          monthlyValues: { [MONTH]: 0.5 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e003',
          taskId: TASK_1_ID,
          memberId: MEMBER_B_ID,
          monthlyValues: { [MONTH]: 0.3 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    // member(あおき) > detail > member(いしだ) > detail(設計) > detail(実装)
    expect(rows.map((r) => r.kind)).toEqual([
      'member',
      'detail',
      'member',
      'detail',
      'detail',
    ])
    const memberRows = memberRowsOf(rows)
    expect(memberRows.map((m) => m.memberName)).toEqual(['あおき', 'いしだ'])
    const ishidaTasks = detailsOf(rows)
      .filter((d) => d.memberId === MEMBER_B_ID)
      .map((d) => d.taskName)
    expect(ishidaTasks).toEqual(['実装', '設計'].sort())
  })

  it('担当者グループ行に解決済み実績合計と計画合計が集計される', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          taskId: TASK_1_ID,
          monthlyValues: { [MONTH]: 0.5 },
          actualMonthlyValues: { [MONTH]: 0.6 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e002',
          taskId: TASK_2_ID,
          monthlyValues: { [MONTH]: 0.3 }, // 実績なし=計画どおり0.3
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    const memberRow = memberRowsOf(rows)[0]
    expect(memberRow?.plannedTotal).toBeCloseTo(0.8)
    expect(memberRow?.actualTotal).toBeCloseTo(0.9)
    expect(memberRow?.isOverCapacity).toBe(false)
  })

  it('実績合計が稼働率上限を超えるとisOverCapacity=true（capacityRatio考慮）', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          memberId: MEMBER_B_ID, // capacityRatio 0.5
          monthlyValues: { [MONTH]: 0.4 },
          actualMonthlyValues: { [MONTH]: 0.6 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(memberRowsOf(rows)[0]?.isOverCapacity).toBe(true)
    expect(memberRowsOf(rows)[0]?.capacityRatio).toBe(0.5)
  })

  it('反証: 丸め誤差では稼働超過と誤検知しない', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          taskId: TASK_1_ID,
          monthlyValues: { [MONTH]: 0.1 },
          actualMonthlyValues: { [MONTH]: 0.7 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e002',
          taskId: TASK_2_ID,
          monthlyValues: { [MONTH]: 0.1 },
          actualMonthlyValues: { [MONTH]: 0.2 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e003',
          projectId: TASK_2_ID,
          taskId: TASK_2_ID,
          monthlyValues: { [MONTH]: 0.1 },
          actualMonthlyValues: { [MONTH]: 0.1 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    // 0.7 + 0.2 + 0.1 = 1.0000000000000002（浮動小数点）でも超過扱いにしない
    expect(memberRowsOf(rows)[0]?.isOverCapacity).toBe(false)
  })

  it('反証: 削除済みメンバーのアサインは行に含めない', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          memberId: '00000000-0000-4000-8000-00000000dead',
          monthlyValues: { [MONTH]: 0.5 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(rows).toHaveLength(0)
  })

  it('タスクの親を辿ってトップレベルのプロジェクトラベルを表示する', () => {
    // projectIdがタスク自身を指すレコード（孫タスク直付け）でもルートまで遡る
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          projectId: TASK_1_ID,
          taskId: TASK_1_ID,
          monthlyValues: { [MONTH]: 0.5 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(detailsOf(rows)[0]?.projectLabel).toBe('P001 基幹刷新')
  })
})

describe('summarizeMonthlyActuals', () => {
  it('明細行のみを対象に計画どおり/上書きを数える', () => {
    const rows = buildMonthlyActualsRows(
      MONTH,
      [
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e001',
          taskId: TASK_1_ID,
          monthlyValues: { [MONTH]: 0.5 },
        }),
        buildAssignment({
          id: '00000000-0000-4000-8000-00000000e002',
          taskId: TASK_2_ID,
          monthlyValues: { [MONTH]: 0.3 },
          actualMonthlyValues: { [MONTH]: 0 },
        }),
      ],
      MEMBERS,
      PROJECTS,
    )
    expect(summarizeMonthlyActuals(rows)).toEqual({
      totalRows: 2,
      plannedRows: 1,
      overriddenRows: 1,
    })
  })

  it('空配列は全て0', () => {
    expect(summarizeMonthlyActuals([])).toEqual({
      totalRows: 0,
      plannedRows: 0,
      overriddenRows: 0,
    })
  })
})

describe('shiftMonthKey', () => {
  it('月を進める・戻す', () => {
    expect(shiftMonthKey('2025-04', 1)).toBe('2025-05')
    expect(shiftMonthKey('2025-04', -1)).toBe('2025-03')
  })

  it('年をまたぐ境界値', () => {
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01')
    expect(shiftMonthKey('2025-01', -1)).toBe('2024-12')
  })

  it('反証: 不正な形式はそのまま返す', () => {
    expect(shiftMonthKey('invalid', 1)).toBe('invalid')
  })
})

describe('getDefaultTargetMonth', () => {
  it('前月を返す（月初に先月分を入力する実務動線）', () => {
    expect(getDefaultTargetMonth(new Date(2025, 4, 1))).toBe('2025-04')
  })

  it('境界値: 1月の前月は前年12月', () => {
    expect(getDefaultTargetMonth(new Date(2026, 0, 15))).toBe('2025-12')
  })
})

describe('formatMonthLabel', () => {
  it('YYYY年M月の形式で返す', () => {
    expect(formatMonthLabel('2025-04')).toBe('2025年4月')
    expect(formatMonthLabel('2025-12')).toBe('2025年12月')
  })

  it('反証: 不正な形式はそのまま返す', () => {
    expect(formatMonthLabel('invalid')).toBe('invalid')
  })
})
