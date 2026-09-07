import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Member } from '@/shared/types/member'
import type { Project, ProjectTreeNode } from '@/shared/types/project'
import type { ProjectBaseline } from '@/shared/types/project-baseline'
import type { ScheduleEntry } from '@/shared/types/schedule'
import {
  buildBaselineSnapshot,
  calcAcAtWeek,
  calcEvAtWeek,
  calcEvmSeries,
  calcPvAtWeek,
  calcPvFromBaseline,
  getActiveBaseline,
  getFiscalYearWeekKeys,
  getProgressRateAtWeek,
  getProgressRateAtWeekOrNull,
  isBaselineStale,
  isEvmChartEligible,
  isEvmInputEligible,
  rebuildPlannedCostWithLatestPrices,
  resolvePlannedCost,
  resolveProgressRateAtWeek,
  type WbsProgressSource,
} from '@/shared/utils/evm-utils'

const PROJECT_ID = crypto.randomUUID()
const OTHER_PROJECT_ID = crypto.randomUUID()
const DIVISION_ID = crypto.randomUUID()
const OTHER_DIVISION_ID = crypto.randomUUID()
const MEMBER_ID = crypto.randomUUID()
const OTHER_MEMBER_ID = crypto.randomUUID()

function makeSchedule(
  startDate: string,
  endDate: string,
  projectId = PROJECT_ID,
): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    projectId,
    phaseKey: 'phase-1',
    startDate,
    endDate,
  }
}

function makeAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    taskId: crypto.randomUUID(),
    memberId: MEMBER_ID,
    monthlyValues: {},
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: 'テストメンバー',
    sectionId: null,
    companyId: null,
    role: '',
    isActive: true,
    techTagIds: [],
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    contractUnitPriceHistory: [],
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('getFiscalYearWeekKeys', () => {
  it('反証: 年度開始日（4/1）が週の途中の場合、最初の要素はその週ではなく次の月曜始まりの週になる（月曜日基準のフィルタのため）', () => {
    const weeks = getFiscalYearWeekKeys(2025, 4)
    // 2025-04-01(火)を含む週は2025-W14だが、月曜（2025-03-31）が年度開始日より前のため対象外。
    // 月曜が年度期間内に収まる最初の週は2025-W15（月曜=2025-04-07）
    expect(weeks[0]).toBe('2025-W15')
  })

  it('反証: 年度末（3/31）を含む週も最後の要素として含まれる', () => {
    const weeks = getFiscalYearWeekKeys(2025, 4)
    const lastWeek = weeks[weeks.length - 1]
    expect(lastWeek).toBeDefined()
  })

  it('反証: 年度をまたぐ週は月曜日が年度期間内にある側にのみ計上される（重複しない）', () => {
    const fy2025 = getFiscalYearWeekKeys(2025, 4)
    const fy2026 = getFiscalYearWeekKeys(2026, 4)
    const overlap = fy2025.filter((w) => fy2026.includes(w))
    expect(overlap).toEqual([])
  })
})

describe('calcPvAtWeek', () => {
  it('反証: ScheduleEntryが0件の場合は0を返す（例外を投げない）', () => {
    expect(calcPvAtWeek('2025-W14', [], 1000)).toBe(0)
  })

  it('スケジュール開始前の週はPV=0', () => {
    const schedule = [makeSchedule('2025-04-07', '2025-06-30')]
    expect(calcPvAtWeek('2025-W13', schedule, 1000)).toBe(0)
  })

  it('スケジュール終了後の週はPV=予算総額（100%）', () => {
    const schedule = [makeSchedule('2025-04-07', '2025-04-13')]
    expect(calcPvAtWeek('2025-W20', schedule, 1000)).toBe(1000)
  })

  it('期間中の週は日数按分される', () => {
    // 2025-04-07(月)〜2025-04-16(水) = 10日間
    const schedule = [makeSchedule('2025-04-07', '2025-04-16')]
    // 2025-W15の日曜は2025-04-13 → 経過7日/10日 = 70%
    const pv = calcPvAtWeek('2025-W15', schedule, 1000)
    expect(pv).toBe(700)
  })

  it('反証: 複数ScheduleEntryがある場合は最小開始日・最大終了日で按分する', () => {
    const schedule = [
      makeSchedule('2025-04-14', '2025-04-20'),
      makeSchedule('2025-04-07', '2025-04-27'), // 最も広い範囲
    ]
    // 全体期間: 2025-04-07〜2025-04-27 = 21日間
    // 2025-W15の日曜は2025-04-13 → 経過7日/21日 = 33.3...% → round(333.33)=333
    expect(calcPvAtWeek('2025-W15', schedule, 1000)).toBe(333)
  })

  it('反証: 単日スケジュール（開始日=終了日）でもゼロ除算にならない', () => {
    // 2025-04-10（木）は2025-W15（月曜=04-07、日曜=04-13）に属する
    const schedule = [makeSchedule('2025-04-10', '2025-04-10')]
    expect(calcPvAtWeek('2025-W15', schedule, 1000)).toBe(1000)
    expect(calcPvAtWeek('2025-W14', schedule, 1000)).toBe(0)
  })
})

describe('getProgressRateAtWeek / calcEvAtWeek', () => {
  it('該当週以下で最新の進捗率を採用する', () => {
    const weeklyProgress = { '2025-W14': 0.3, '2025-W16': 0.6 }
    expect(getProgressRateAtWeek('2025-W15', weeklyProgress)).toBe(0.3)
    expect(getProgressRateAtWeek('2025-W16', weeklyProgress)).toBe(0.6)
    expect(getProgressRateAtWeek('2025-W20', weeklyProgress)).toBe(0.6)
  })

  it('反証: 該当週以下のエントリが1件も無い場合は0を返す', () => {
    const weeklyProgress = { '2025-W20': 0.9 }
    expect(getProgressRateAtWeek('2025-W14', weeklyProgress)).toBe(0)
  })

  it('反証: weeklyProgressが空オブジェクトの場合も0を返す', () => {
    expect(getProgressRateAtWeek('2025-W14', {})).toBe(0)
  })

  it('反証: 年をまたぐ週キーの大小比較が正しく機能する（文字列比較の落とし穴回避）', () => {
    // "2025-W02" は "2024-W53" より新しい週のはず（文字列としては"2024-W53" < "2025-W02"で正しい）
    const weeklyProgress = { '2024-W53': 0.2, '2025-W02': 0.5 }
    expect(getProgressRateAtWeek('2025-W02', weeklyProgress)).toBe(0.5)
    expect(getProgressRateAtWeek('2024-W53', weeklyProgress)).toBe(0.2)
  })

  it('calcEvAtWeekは進捗率×予算総額を四捨五入して返す', () => {
    expect(calcEvAtWeek('2025-W15', { '2025-W14': 0.333 }, 1000)).toBe(333)
  })
})

describe('calcAcAtWeek', () => {
  it('対象週の日曜日が属する月は月内経過日数で按分する（月内日数按分）', () => {
    // 2025-W15の日曜=2025-04-13、4月は30日 → 経過13日/30日
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 90 }],
      }),
    ]
    // round(1.0 * 13/30 * 90) = round(39) = 39
    expect(calcAcAtWeek('2025-W15', assignments, members, PROJECT_ID)).toBe(39)
  })

  it('対象週の日曜日より前の月は100%（全額）を計上する', () => {
    // 2025-W20の日曜=2025-05-18 → 2025-04は完全に経過済み
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 0.5 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(50)
  })

  it('反証: 対象週の日曜日より後の月（未来月）は0として扱う', () => {
    // 2025-W15（2025-04）時点では2025-05は未到来
    const assignments = [makeAssignment({ monthlyValues: { '2025-05': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W15', assignments, members, PROJECT_ID)).toBe(0)
  })

  it('反証: 他案件のAssignmentEntryは合算対象外', () => {
    const assignments = [
      makeAssignment({
        projectId: OTHER_PROJECT_ID,
        monthlyValues: { '2025-04': 1.0 },
      }),
    ]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 999 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(0)
  })

  it('複数メンバーのアサインを横断して合算する', () => {
    const assignments = [
      makeAssignment({
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 1.0 },
      }),
      makeAssignment({
        memberId: OTHER_MEMBER_ID,
        monthlyValues: { '2025-04': 0.5 },
      }),
    ]
    const members = [
      makeMember({
        id: MEMBER_ID,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
      makeMember({
        id: OTHER_MEMBER_ID,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      }),
    ]
    // 2025-W20時点で2025-04は完全経過: (1.0*100) + (0.5*100) = 150
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(150)
  })

  it('契約単価履歴が空の場合は通常の単価（unitPriceHistory）にフォールバックする', () => {
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [],
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(80)
  })

  it('反証: アサイン先のmemberIdがmembersに存在しなくても例外を投げず0として扱う', () => {
    const assignments = [
      makeAssignment({
        memberId: crypto.randomUUID(),
        monthlyValues: { '2025-04': 1.0 },
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, [], PROJECT_ID)).toBe(0)
  })

  it('反証: 対象月に適用可能な単価エントリが1件も無い場合は0として扱う', () => {
    // unitPriceHistoryのeffectiveFromが対象月（2025-04）より未来のため適用不可
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [],
        unitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(0)
  })

  it('反証: contractUnitPriceHistoryが未設定（undefined、空配列ではない）でも通常の単価にフォールバックする', () => {
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: undefined,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 70 }],
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(70)
  })

  it('反証: 年度をまたぐ月キーの大小比較が正しく機能する（文字列比較の落とし穴回避）', () => {
    // 2025-W52の日曜=2025-12-28（基準月=2025-12）
    // '2025-10'（過去月）は文字列としても '2025-12' より小さく正しく100%扱いになるはず
    // '2026-01'（未来月）は文字列としても '2025-12' より大きく正しく0%扱いになるはず
    const assignments = [
      makeAssignment({
        monthlyValues: { '2025-10': 0.5, '2026-01': 1.0 },
      }),
    ]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-01', amount: 100 }],
      }),
    ]
    // '2025-10'分のみ計上: round(0.5*1*100) = 50、'2026-01'分は未到来のため0
    expect(calcAcAtWeek('2025-W52', assignments, members, PROJECT_ID)).toBe(50)
  })
})

describe('ProjectBaseline（PV曲線の基準線）', () => {
  function makeBaseline(
    overrides: Partial<ProjectBaseline> = {},
  ): ProjectBaseline {
    return {
      id: crypto.randomUUID(),
      projectId: PROJECT_ID,
      version: 1,
      approvedAt: '2025-04-01',
      reason: '当初計画',
      bacAmount: 1000,
      monthlyPlannedCost: { '2025-04': 300, '2025-05': 150 },
      plannedAllocations: [],
      createdAt: '2025-04-01T00:00:00.000Z',
      ...overrides,
    }
  }

  describe('calcPvFromBaseline', () => {
    const cost = { '2025-04': 300, '2025-05': 150 }

    it('月次計画コストの配分に従ってBACを按分する', () => {
      // W14の日曜=2025-04-06 → 4月は6/30経過 → 300*0.2=60 / 総額450 → 1000*0.1333=133
      expect(calcPvFromBaseline('2025-W14', cost, 1000)).toBe(133)
    })

    it('月をまたぐと前月分は全額、当月分は日数按分で加算される', () => {
      // W18の日曜=2025-05-04 → 4月全額300 + 5月4/31=19.35 → 319.35/450 → 710
      expect(calcPvFromBaseline('2025-W18', cost, 1000)).toBe(710)
    })

    // 核心: 計画コストの総額がBACと一致しなくても、PVの終点は必ずBACに揃う。
    // 揃わないと「計画どおり完了してもPVがBACに届かない」状態になりEVMが破綻する
    it('全期間経過後のPVはBACに一致する（計画コスト総額がBACと異なっていても）', () => {
      // 総額450に対しBACは1000（体制が組みきれていない案件を想定）
      expect(calcPvFromBaseline('2025-W23', cost, 1000)).toBe(1000)
      // 逆にBACより計画コストが大きい場合も終点はBAC
      expect(calcPvFromBaseline('2025-W23', cost, 200)).toBe(200)
    })

    it('計画期間の開始前は0を返す', () => {
      expect(calcPvFromBaseline('2025-W10', cost, 1000)).toBe(0)
    })

    // 反証: アサイン計画が空だとPV曲線を引く根拠が無い
    it('反証: 月次計画コストが空または全て0なら0を返す', () => {
      expect(calcPvFromBaseline('2025-W20', {}, 1000)).toBe(0)
      expect(calcPvFromBaseline('2025-W20', { '2025-04': 0 }, 1000)).toBe(0)
    })
  })

  describe('getActiveBaseline', () => {
    it('案件内で最大のversionを持つベースラインを返す', () => {
      const v1 = makeBaseline({ version: 1 })
      const v2 = makeBaseline({ version: 2, reason: 'CR#1' })
      expect(getActiveBaseline([v1, v2], PROJECT_ID)?.version).toBe(2)
      // 配列の順序に依存しない
      expect(getActiveBaseline([v2, v1], PROJECT_ID)?.version).toBe(2)
    })

    // 反証: 他案件のベースラインを拾ってはいけない
    it('反証: 他案件のベースラインは対象にしない', () => {
      const other = makeBaseline({ projectId: OTHER_PROJECT_ID, version: 9 })
      expect(getActiveBaseline([other], PROJECT_ID)).toBeNull()
    })

    it('1件も無ければnullを返す', () => {
      expect(getActiveBaseline([], PROJECT_ID)).toBeNull()
    })
  })

  describe('buildBaselineSnapshot', () => {
    const member = makeMember({
      contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 300 }],
    })

    it('アサイン計画×単価で月次計画コストを構築する', () => {
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 1.0, '2025-05': 0.5 } }),
      ]
      const snapshot = buildBaselineSnapshot(PROJECT_ID, assignments, [member])
      expect(snapshot.monthlyPlannedCost).toEqual({
        '2025-04': 300,
        '2025-05': 150,
      })
    })

    it('同一メンバーが複数タスクにアサインされている場合は月ごとに合算する', () => {
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 0.4 } }),
        makeAssignment({ monthlyValues: { '2025-04': 0.6 } }),
      ]
      const snapshot = buildBaselineSnapshot(PROJECT_ID, assignments, [member])
      expect(snapshot.monthlyPlannedCost['2025-04']).toBe(300)
      // 配分率も1レコードへマージされる（latestモードでの再計算に使うため）
      expect(snapshot.plannedAllocations).toHaveLength(1)
      expect(
        snapshot.plannedAllocations[0]?.monthlyValues['2025-04'],
      ).toBeCloseTo(1.0)
    })

    // 反証: 他案件のアサインを混ぜるとPVが過大になる
    it('反証: 他案件のアサインは集計に含めない', () => {
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 1.0 } }),
        makeAssignment({
          projectId: OTHER_PROJECT_ID,
          monthlyValues: { '2025-04': 1.0 },
        }),
      ]
      const snapshot = buildBaselineSnapshot(PROJECT_ID, assignments, [member])
      expect(snapshot.monthlyPlannedCost['2025-04']).toBe(300)
    })

    // 反証: 配分0の月をキーとして残すと、PV按分の分母が意味を持たなくなる
    it('反証: 配分率0の月は月次計画コストに含めない', () => {
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 1.0, '2025-05': 0 } }),
      ]
      const snapshot = buildBaselineSnapshot(PROJECT_ID, assignments, [member])
      expect(Object.keys(snapshot.monthlyPlannedCost)).toEqual(['2025-04'])
    })

    // 反証: 削除済みメンバーを参照するアサインが残っていても例外にせず無視する
    it('反証: 存在しないメンバーを参照するアサインは無視する', () => {
      const assignments = [
        makeAssignment({
          memberId: OTHER_MEMBER_ID,
          monthlyValues: { '2025-04': 1.0 },
        }),
      ]
      expect(() =>
        buildBaselineSnapshot(PROJECT_ID, assignments, [member]),
      ).not.toThrow()
      expect(
        buildBaselineSnapshot(PROJECT_ID, assignments, [member])
          .monthlyPlannedCost,
      ).toEqual({})
    })

    it('契約単価が無いメンバーは通常単価にフォールバックする（calcAcAtWeekと同一の解決）', () => {
      const internal = makeMember({
        contractUnitPriceHistory: [],
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 200 }],
      })
      const snapshot = buildBaselineSnapshot(
        PROJECT_ID,
        [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })],
        [internal],
      )
      expect(snapshot.monthlyPlannedCost['2025-04']).toBe(200)
    })
  })

  describe('単価モード（frozen / latest）', () => {
    const allocations = [
      {
        memberId: MEMBER_ID,
        monthlyValues: { '2025-04': 1.0, '2025-05': 0.5 },
      },
    ]
    // 凍結時は単価200、現在は単価300へ改定された想定
    const membersAfterRaise = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 300 }],
      }),
    ]

    it('rebuildPlannedCostWithLatestPricesは最新単価で月次計画コストを再構築する', () => {
      expect(
        rebuildPlannedCostWithLatestPrices(allocations, membersAfterRaise),
      ).toEqual({ '2025-04': 300, '2025-05': 150 })
    })

    it('frozenモードは凍結時の金額をそのまま使う', () => {
      const baseline = makeBaseline({
        monthlyPlannedCost: { '2025-04': 200, '2025-05': 100 },
        plannedAllocations: allocations,
      })
      expect(resolvePlannedCost(baseline, 'frozen', membersAfterRaise)).toEqual(
        {
          '2025-04': 200,
          '2025-05': 100,
        },
      )
      // 未指定（undefined）もfrozen扱い
      expect(
        resolvePlannedCost(baseline, undefined, membersAfterRaise),
      ).toEqual({ '2025-04': 200, '2025-05': 100 })
    })

    it('latestモードは配分率スナップショットへ最新単価を適用し直す', () => {
      const baseline = makeBaseline({
        monthlyPlannedCost: { '2025-04': 200, '2025-05': 100 },
        plannedAllocations: allocations,
      })
      expect(resolvePlannedCost(baseline, 'latest', membersAfterRaise)).toEqual(
        {
          '2025-04': 300,
          '2025-05': 150,
        },
      )
    })

    // 反証: 配分率スナップショットを持たない旧データでlatestを選んでもPVが消えない
    it('反証: 配分率スナップショットが空ならlatest指定でも凍結時の金額へフォールバックする', () => {
      const baseline = makeBaseline({
        monthlyPlannedCost: { '2025-04': 200 },
        plannedAllocations: [],
      })
      expect(resolvePlannedCost(baseline, 'latest', membersAfterRaise)).toEqual(
        {
          '2025-04': 200,
        },
      )
    })

    // 反証: 参照先メンバーが全員削除されている場合も、PVを0にせず凍結時の金額を使う
    it('反証: 配分先のメンバーが存在しない場合は凍結時の金額へフォールバックする', () => {
      const baseline = makeBaseline({
        monthlyPlannedCost: { '2025-04': 200 },
        plannedAllocations: allocations,
      })
      expect(resolvePlannedCost(baseline, 'latest', [])).toEqual({
        '2025-04': 200,
      })
    })

    it('calcEvmSeriesはunitPriceModeに応じてPVの按分形状を切り替える', () => {
      const baseline = makeBaseline({
        bacAmount: 1000,
        // 凍結時は4月が薄く5月が厚い配分
        monthlyPlannedCost: { '2025-04': 100, '2025-05': 300 },
        plannedAllocations: allocations,
      })
      const input = {
        weekKeys: ['2025-W18'],
        projectId: PROJECT_ID,
        scheduleEntries: [makeSchedule('2025-04-01', '2025-06-30')],
        weeklyProgress: {},
        assignments: [],
        members: membersAfterRaise,
        budgetTotal: 1000,
        baseline,
      }
      const frozen = calcEvmSeries({ ...input, unitPriceMode: 'frozen' })
      const latest = calcEvmSeries({ ...input, unitPriceMode: 'latest' })
      // 最新単価では4月が厚い配分（300:150）に変わるため、同じ週のPVが増える
      expect(latest[0]?.pv).toBeGreaterThan(frozen[0]?.pv as number)
    })
  })

  describe('isBaselineStale（再ベースラインを促す乖離判定）', () => {
    it('現行BACが±10%以内なら乖離とみなさない', () => {
      const baseline = makeBaseline({ bacAmount: 1000 })
      expect(isBaselineStale(1000, baseline)).toBe(false)
      expect(isBaselineStale(1100, baseline)).toBe(false)
      expect(isBaselineStale(900, baseline)).toBe(false)
    })

    it('現行BACが+10%を超えたら乖離と判定する（スコープ増）', () => {
      const baseline = makeBaseline({ bacAmount: 1000 })
      expect(isBaselineStale(1300, baseline)).toBe(true)
    })

    // 縮小方向の乖離も検知する（スコープ削減後にPVが過大なままになるのを防ぐ）
    it('現行BACが-10%を下回っても乖離と判定する（スコープ削減）', () => {
      const baseline = makeBaseline({ bacAmount: 1000 })
      expect(isBaselineStale(700, baseline)).toBe(true)
    })

    it('しきい値を指定できる', () => {
      const baseline = makeBaseline({ bacAmount: 1000 })
      expect(isBaselineStale(1050, baseline, 0.01)).toBe(true)
      expect(isBaselineStale(1050, baseline, 0.2)).toBe(false)
    })

    // 反証: 未凍結の案件で乖離警告を出しても「更新」する対象が無く、意味を成さない
    it('反証: ベースラインが無い場合はfalseを返す', () => {
      expect(isBaselineStale(1000, null)).toBe(false)
      expect(isBaselineStale(1000, undefined)).toBe(false)
    })

    // 反証: bacAmount=0のベースラインで割ると Infinity/NaN になる
    it('反証: 凍結時BACが0でもゼロ除算にならず、現行BACが付いた時点で乖離とする', () => {
      const zero = makeBaseline({ bacAmount: 0 })
      expect(isBaselineStale(500, zero)).toBe(true)
      expect(isBaselineStale(0, zero)).toBe(false)
    })
  })

  describe('calcEvmSeries（ベースライン指定時）', () => {
    const baseInput = {
      weekKeys: ['2025-W18'],
      projectId: PROJECT_ID,
      scheduleEntries: [makeSchedule('2025-04-01', '2025-06-30')],
      weeklyProgress: {},
      assignments: [],
      members: [],
      budgetTotal: 500,
    }

    it('PVがベースラインの月次配分に従う（スケジュール均等按分ではない）', () => {
      const series = calcEvmSeries({ ...baseInput, baseline: makeBaseline() })
      // ベースライン按分（710）とスケジュール均等按分は一致しない
      expect(series[0]?.pv).toBe(710)
      const withoutBaseline = calcEvmSeries(baseInput)
      expect(withoutBaseline[0]?.pv).not.toBe(710)
    })

    it('EVの基準額は現行BACではなくベースラインのbacAmountになる', () => {
      const series = calcEvmSeries({
        ...baseInput,
        weeklyProgress: { '2025-W17': 0.5 },
        baseline: makeBaseline({ bacAmount: 1000 }),
      })
      // budgetTotal=500ではなくbacAmount=1000の50%
      expect(series[0]?.ev).toBe(500)
    })

    // 反証: 凍結済みでもアサイン計画が空だとPV曲線を引けないため従来動作へ戻す
    it('反証: アサイン計画が空のベースラインではスケジュール均等按分にフォールバックする', () => {
      const empty = makeBaseline({ monthlyPlannedCost: {}, bacAmount: 1000 })
      const series = calcEvmSeries({ ...baseInput, baseline: empty })
      const fallback = calcEvmSeries({ ...baseInput, budgetTotal: 1000 })
      expect(series[0]?.pv).toBe(fallback[0]?.pv)
      expect(series[0]?.pv).toBeGreaterThan(0)
    })
  })
})

describe('calcAcAtWeek（実績の例外入力）', () => {
  const members = [
    makeMember({
      contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
    }),
  ]

  it('実績の例外入力がある月はその値でACを算出する', () => {
    const assignments = [
      makeAssignment({
        monthlyValues: { '2025-04': 1.0 },
        actualMonthlyValues: { '2025-04': 0.6 },
      }),
    ]
    // 2025-W20の日曜=2025-05-18 → 4月は全額経過
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(60)
  })

  // 反証: 未入力の月を0として扱うと、実績を1件入力しただけで他の月のACが消える
  it('反証: 実績が未入力の月は計画値をそのまま使う（0扱いにしない）', () => {
    const assignments = [
      makeAssignment({
        monthlyValues: { '2025-04': 1.0, '2025-05': 1.0 },
        actualMonthlyValues: { '2025-04': 0.6 },
      }),
    ]
    // 2025-W25の日曜=2025-06-22 → 4月も5月も全額経過。4月は実績0.6、5月は計画1.0
    expect(calcAcAtWeek('2025-W25', assignments, members, PROJECT_ID)).toBe(160)
  })

  // 明示的に0を入力した場合は「稼働しなかった」として0で計上する
  it('実績に0を明示入力した月は0として計上する', () => {
    const assignments = [
      makeAssignment({
        monthlyValues: { '2025-04': 1.0 },
        actualMonthlyValues: { '2025-04': 0 },
      }),
    ]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(0)
  })

  // 反証: 計画に無い月へ実績だけ入力された場合（計画外の稼働）も取りこぼさない
  it('反証: 計画に無い月の実績もACへ算入する', () => {
    const assignments = [
      makeAssignment({
        monthlyValues: { '2025-04': 1.0 },
        actualMonthlyValues: { '2025-05': 0.5 },
      }),
    ]
    // 4月は計画1.0（100）＋ 5月は実績0.5（50）
    expect(calcAcAtWeek('2025-W25', assignments, members, PROJECT_ID)).toBe(150)
  })

  it('actualMonthlyValuesが未設定なら従来どおり計画値のみで算出する', () => {
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 0.5 } })]
    expect(calcAcAtWeek('2025-W20', assignments, members, PROJECT_ID)).toBe(50)
  })
})

describe('resolveProgressRateAtWeek（週次手入力とWBS完了チェックの優先順位）', () => {
  function makeTreeNode(
    overrides: Partial<ProjectTreeNode> = {},
  ): ProjectTreeNode {
    return {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト',
      parentId: null,
      level: 0,
      status: 'active',
      confidence: null,
      completed: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      children: [],
      depth: 0,
      ...overrides,
    }
  }

  function makeEffort(projectId: string, value: number): EffortEntry {
    return {
      id: crypto.randomUUID(),
      projectId,
      columnId: 'effort-1',
      value,
    }
  }

  // 2025-W16の日曜日は2025-04-20
  function buildWbsSource(): WbsProgressSource {
    const done = makeTreeNode({
      level: 1,
      completed: true,
      completedAt: '2025-04-10',
    })
    const pending = makeTreeNode({ level: 1, completed: false })
    const node = makeTreeNode({ children: [done, pending] })
    return {
      node,
      columnIds: ['effort-1'],
      efforts: [makeEffort(done.id, 30), makeEffort(pending.id, 70)],
    }
  }

  it('週次の手入力がある週はその値を優先する', () => {
    const source = buildWbsSource()
    expect(
      resolveProgressRateAtWeek('2025-W16', { '2025-W15': 0.8 }, source),
    ).toBe(0.8)
  })

  it('週次の手入力が無い場合はWBS完了チェックから工数加重で導出する', () => {
    const source = buildWbsSource()
    // 完了30人日 / 全体100人日 = 0.3
    expect(resolveProgressRateAtWeek('2025-W16', {}, source)).toBeCloseTo(0.3)
  })

  // 反証: 完了日が基準週より後のタスクは、その週の進捗率に算入されない
  it('反証: 基準週の日曜より後に完了したタスクはその週の進捗率へ算入しない', () => {
    const source = buildWbsSource()
    // 2025-W14の日曜=2025-04-06 < 完了日2025-04-10 のため未完了扱い
    expect(resolveProgressRateAtWeek('2025-W14', {}, source)).toBe(0)
  })

  // 反証: 手入力もWBSソースも無い場合は0（未記録を0%として扱う従来動作）
  it('反証: 手入力もWBSソースも無い場合は0を返す', () => {
    expect(resolveProgressRateAtWeek('2025-W16', {})).toBe(0)
    expect(resolveProgressRateAtWeek('2025-W16', {}, null)).toBe(0)
  })

  // 反証: 手入力が0%でも「記録済み」として扱い、WBSへフォールバックしない
  it('反証: 手入力の0%はWBS導出より優先される（未記録と区別する）', () => {
    const source = buildWbsSource()
    expect(
      resolveProgressRateAtWeek('2025-W16', { '2025-W15': 0 }, source),
    ).toBe(0)
  })

  it('getProgressRateAtWeekOrNullは未記録でnull、記録済みで直近値を返す', () => {
    expect(getProgressRateAtWeekOrNull('2025-W16', {})).toBeNull()
    expect(
      getProgressRateAtWeekOrNull('2025-W16', { '2025-W20': 0.9 }),
    ).toBeNull()
    expect(getProgressRateAtWeekOrNull('2025-W16', { '2025-W15': 0.4 })).toBe(
      0.4,
    )
  })

  it('calcEvAtWeekはwbsSource指定時に工数加重の進捗率でEVを算出する', () => {
    const source = buildWbsSource()
    expect(calcEvAtWeek('2025-W16', {}, 1000, source)).toBe(300)
  })
})

describe('isEvmInputEligible / isEvmChartEligible', () => {
  const topLevelProject: Pick<Project, 'id' | 'level' | 'divisionId'> = {
    id: PROJECT_ID,
    level: 0,
    divisionId: DIVISION_ID,
  }

  it('トップレベル・部門一致・ScheduleEntryありなら入力対象になる', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(isEvmInputEligible(topLevelProject, schedule, DIVISION_ID)).toBe(
      true,
    )
  })

  it('反証: トップレベルでない（level>0）場合は対象外', () => {
    const taskLevelProject = { ...topLevelProject, level: 1 }
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(isEvmInputEligible(taskLevelProject, schedule, DIVISION_ID)).toBe(
      false,
    )
  })

  it('反証: divisionIdが選択中部門と一致しない場合は対象外', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(
      isEvmInputEligible(topLevelProject, schedule, OTHER_DIVISION_ID),
    ).toBe(false)
  })

  it('反証: ScheduleEntryが1件も無い場合は対象外', () => {
    expect(isEvmInputEligible(topLevelProject, [], DIVISION_ID)).toBe(false)
  })

  it('反証: divisionIdがnullの案件は対象外', () => {
    const noDivisionProject = { ...topLevelProject, divisionId: null }
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(isEvmInputEligible(noDivisionProject, schedule, DIVISION_ID)).toBe(
      false,
    )
  })

  it('チャート表示対象は入力対象条件に加えProjectProgressEntryが必要', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    const progress = [
      {
        id: crypto.randomUUID(),
        projectId: PROJECT_ID,
        weeklyProgress: { '2025-W14': 0.5 },
        createdAt: '2025-04-01T00:00:00.000Z',
        updatedAt: '2025-04-01T00:00:00.000Z',
      },
    ]
    expect(
      isEvmChartEligible(topLevelProject, schedule, progress, DIVISION_ID),
    ).toBe(true)
  })

  it('反証: 入力対象条件を満たしてもProjectProgressEntryもWBS完了チェックも無ければチャート対象外', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(isEvmChartEligible(topLevelProject, schedule, [], DIVISION_ID)).toBe(
      false,
    )
  })

  // ProjectProgressEntryが無くても、WBSに完了チェックがあればEVを工数加重で導出できるため
  // チャート対象になる（非公開の設計文書）
  it('ProjectProgressEntryが無くてもWBS完了チェックがあればチャート対象になる', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(
      isEvmChartEligible(topLevelProject, schedule, [], DIVISION_ID, true),
    ).toBe(true)
  })

  // 反証: WBS完了チェックがあっても、そもそも入力対象条件（部門一致等）を満たさなければ対象外
  it('反証: WBS完了チェックがあっても部門が一致しなければチャート対象外', () => {
    const schedule = [makeSchedule('2025-04-01', '2025-04-30')]
    expect(
      isEvmChartEligible(
        topLevelProject,
        schedule,
        [],
        OTHER_DIVISION_ID,
        true,
      ),
    ).toBe(false)
  })
})

describe('calcEvmSeries', () => {
  it('週配列に対してPV/EV/ACが同じ週キーで揃った配列を返す', () => {
    // 2025-04-07(月)〜2025-04-27(日) = 21日間
    const schedule = [makeSchedule('2025-04-07', '2025-04-27')]
    const weeklyProgress = { '2025-W14': 0.5 }
    const assignments = [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })]
    const members = [
      makeMember({
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 300 }],
      }),
    ]
    const series = calcEvmSeries({
      weekKeys: ['2025-W15', '2025-W16'],
      projectId: PROJECT_ID,
      scheduleEntries: schedule,
      weeklyProgress,
      assignments,
      members,
      budgetTotal: 1000,
    })
    // W15日曜=04-13→経過7日/21日=33.3%→333、W16日曜=04-20→経過14日/21日=66.7%→667
    // 進捗率はW14時点の0.5がどちらの週にも適用される（該当週以下で最新の値）
    // ACは月内日数按分: W15(日曜=04-13、4月30日中13日)=round(1.0*13/30*300)=130
    //                   W16(日曜=04-20、4月30日中20日)=round(1.0*20/30*300)=200
    expect(series).toEqual([
      { week: '2025-W15', pv: 333, ev: 500, ac: 130 },
      { week: '2025-W16', pv: 667, ev: 500, ac: 200 },
    ])
  })

  it('反証: 他案件のScheduleEntryが混在していても対象案件分のみでPVを算出する', () => {
    const schedule = [
      makeSchedule('2025-04-07', '2025-04-13'), // 対象案件、W15の月〜日ちょうど
      makeSchedule('2025-01-01', '2025-12-31', OTHER_PROJECT_ID), // 他案件、長期
    ]
    const series = calcEvmSeries({
      weekKeys: ['2025-W20'],
      projectId: PROJECT_ID,
      scheduleEntries: schedule,
      weeklyProgress: {},
      assignments: [],
      members: [],
      budgetTotal: 1000,
    })
    // 対象案件のスケジュールはW15で終わっており、W20時点ではPV=100%
    // （他案件の長期スケジュールに引きずられて按分が変わらないことを確認）
    expect(series[0]?.pv).toBe(1000)
  })
})
