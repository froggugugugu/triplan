import { describe, expect, it } from 'vitest'
import type { ProjectBaseline } from '@/shared/types/project-baseline'
import {
  type AppAlert,
  type BillingAcceptanceAlertInput,
  collectBaselineStaleAlerts,
  collectBillingAcceptanceAlerts,
  collectBudgetOverrunAlerts,
  collectCapacityAlerts,
  collectDueDateAlerts,
  collectRiskDueDateAlerts,
  collectSaasRenewalAlerts,
  collectUpcomingDueDateAlerts,
  DUE_SOON_THRESHOLD_DAYS,
  type DueDateAlertInput,
  sortAlerts,
} from '../alert-utils'

const PROJECT_ID = crypto.randomUUID()
const MEMBER_ID = crypto.randomUUID()

describe('sortAlerts', () => {
  it('critical → warning → info の順に並べ替える', () => {
    const alerts: AppAlert[] = [
      { key: 'a', severity: 'info', category: 'x', message: '' },
      { key: 'b', severity: 'critical', category: 'x', message: '' },
      { key: 'c', severity: 'warning', category: 'x', message: '' },
    ]
    expect(sortAlerts(alerts).map((a) => a.key)).toEqual(['b', 'c', 'a'])
  })

  it('元の配列を破壊しない', () => {
    const alerts: AppAlert[] = [
      { key: 'a', severity: 'info', category: 'x', message: '' },
      { key: 'b', severity: 'critical', category: 'x', message: '' },
    ]
    sortAlerts(alerts)
    expect(alerts[0]?.key).toBe('a')
  })
})

describe('collectDueDateAlerts', () => {
  function makeInput(
    overrides: Partial<DueDateAlertInput> = {},
  ): DueDateAlertInput {
    return {
      id: PROJECT_ID,
      name: 'テスト案件',
      masterDueDate: '2026-03-31',
      status: 'active',
      scheduleStart: '2025-04-01',
      progressRate: 0.5,
      ...overrides,
    }
  }

  it('マスター納期を過ぎた未完了案件はcritical', () => {
    const alerts = collectDueDateAlerts(
      [makeInput({ masterDueDate: '2026-03-31' })],
      '2026-04-01',
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('critical')
    expect(alerts[0]?.message).toContain('超過')
  })

  // 境界値: 納期当日はまだ超過ではない
  it('境界値: 納期当日は超過扱いにしない', () => {
    // 進捗50%で残り日数が十分あるケース（予測も納期内）
    const alerts = collectDueDateAlerts(
      [
        makeInput({
          masterDueDate: '2026-03-31',
          scheduleStart: '2026-03-01',
          progressRate: 0.9,
        }),
      ],
      '2026-03-31',
    )
    expect(alerts.filter((a) => a.severity === 'critical')).toHaveLength(0)
  })

  it('完了済みの案件は納期を過ぎていてもアラートを出さない', () => {
    const alerts = collectDueDateAlerts(
      [makeInput({ status: 'completed' })],
      '2026-04-01',
    )
    expect(alerts).toHaveLength(0)
  })

  it('線形予測で完了見込みが納期を超える場合はwarning', () => {
    // 開始2025-04-01、今日2025-06-09（経過70日）、進捗20% → 予測350日 → 2026-03-16...納期2025-12-31超え
    const alerts = collectDueDateAlerts(
      [
        makeInput({
          masterDueDate: '2025-12-31',
          scheduleStart: '2025-04-01',
          progressRate: 0.2,
        }),
      ],
      '2025-06-09',
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('warning')
    expect(alerts[0]?.message).toContain('見込み')
  })

  it('予測が納期内に収まる場合はアラートを出さない', () => {
    // 経過70日、進捗50% → 予測140日 → 2025-08-18 < 2025-12-31
    const alerts = collectDueDateAlerts(
      [
        makeInput({
          masterDueDate: '2025-12-31',
          scheduleStart: '2025-04-01',
          progressRate: 0.5,
        }),
      ],
      '2025-06-09',
    )
    expect(alerts).toHaveLength(0)
  })

  // 反証: 進捗0のまま予測すると開始直後の案件が常に警告になる（ゼロ除算含む）
  it('反証: 進捗率0の案件は遅延予測しない（誤報防止・ゼロ除算回避）', () => {
    expect(() =>
      collectDueDateAlerts([makeInput({ progressRate: 0 })], '2025-06-09'),
    ).not.toThrow()
    expect(
      collectDueDateAlerts([makeInput({ progressRate: 0 })], '2025-06-09'),
    ).toHaveLength(0)
  })

  it('反証: マスター納期未設定・スケジュール無しの案件は対象外', () => {
    expect(
      collectDueDateAlerts([makeInput({ masterDueDate: null })], '2026-04-01'),
    ).toHaveLength(0)
    expect(
      collectDueDateAlerts(
        [makeInput({ scheduleStart: null, masterDueDate: '2025-12-31' })],
        '2025-06-09',
      ),
    ).toHaveLength(0)
  })
})

describe('collectCapacityAlerts', () => {
  const months = ['2025-04', '2025-05']

  it('稼働率上限を超えた月があるメンバーをwarningで検出し、超過月を列挙する', () => {
    const alerts = collectCapacityAlerts(
      [{ id: MEMBER_ID, name: '佐藤', capacityRatio: 0.5 }],
      [
        {
          memberId: MEMBER_ID,
          monthlyValues: { '2025-04': 0.4, '2025-05': 0.8 },
        },
        { memberId: MEMBER_ID, monthlyValues: { '2025-04': 0.3 } },
      ],
      months,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.message).toContain('佐藤')
    expect(alerts[0]?.message).toContain('2025-04')
    expect(alerts[0]?.message).toContain('2025-05')
  })

  it('capacityRatio未設定は1.0を上限として判定する', () => {
    const alerts = collectCapacityAlerts(
      [{ id: MEMBER_ID, name: '佐藤' }],
      [{ memberId: MEMBER_ID, monthlyValues: { '2025-04': 1.0 } }],
      months,
    )
    expect(alerts).toHaveLength(0)
  })

  // 反証: 浮動小数点の丸め誤差（0.1+0.2）で誤検知しない
  it('反証: 丸め誤差では超過と判定しない', () => {
    const alerts = collectCapacityAlerts(
      [{ id: MEMBER_ID, name: '佐藤', capacityRatio: 0.3 }],
      [
        { memberId: MEMBER_ID, monthlyValues: { '2025-04': 0.1 } },
        { memberId: MEMBER_ID, monthlyValues: { '2025-04': 0.2 } },
      ],
      months,
    )
    expect(alerts).toHaveLength(0)
  })

  it('反証: 他メンバーのアサインを合算しない', () => {
    const other = crypto.randomUUID()
    const alerts = collectCapacityAlerts(
      [{ id: MEMBER_ID, name: '佐藤' }],
      [
        { memberId: MEMBER_ID, monthlyValues: { '2025-04': 0.6 } },
        { memberId: other, monthlyValues: { '2025-04': 0.6 } },
      ],
      months,
    )
    expect(alerts).toHaveLength(0)
  })
})

describe('collectBaselineStaleAlerts', () => {
  function makeBaseline(bacAmount: number): ProjectBaseline {
    return {
      id: crypto.randomUUID(),
      projectId: PROJECT_ID,
      version: 1,
      approvedAt: '2025-04-01',
      reason: '当初計画',
      bacAmount,
      monthlyPlannedCost: {},
      plannedAllocations: [],
      createdAt: '2025-04-01T00:00:00.000Z',
    }
  }

  it('現行BACが±10%を超えて乖離した案件をwarningで検出する', () => {
    const alerts = collectBaselineStaleAlerts(
      [{ projectId: PROJECT_ID, name: 'テスト案件', currentBac: 1300 }],
      [makeBaseline(1000)],
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.category).toBe('EVM')
  })

  // 反証: 乖離閾値の設定化（P0-a）。同じ入力でも閾値設定で検出結果が変わる
  it('反証: 乖離閾値を設定で狭める/広げると検出結果が変わる（P0-a設定化）', () => {
    const eightPercent = [
      { projectId: PROJECT_ID, name: 'テスト案件', currentBac: 1080 },
    ]
    const baselines = [makeBaseline(1000)]
    // 8%乖離: 既定閾値（±10%）では検出されない
    expect(collectBaselineStaleAlerts(eightPercent, baselines)).toHaveLength(0)
    // 閾値を5%へ狭めると検出される
    expect(
      collectBaselineStaleAlerts(eightPercent, baselines, 0.05),
    ).toHaveLength(1)
    // 閾値を50%へ広げると30%乖離でも検出されない
    expect(
      collectBaselineStaleAlerts(
        [{ projectId: PROJECT_ID, name: 'テスト案件', currentBac: 1300 }],
        baselines,
        0.5,
      ),
    ).toHaveLength(0)
  })

  it('反証: 未凍結の案件は対象外（凍結の催促はアラートにしない）', () => {
    const alerts = collectBaselineStaleAlerts(
      [{ projectId: PROJECT_ID, name: 'テスト案件', currentBac: 1300 }],
      [],
    )
    expect(alerts).toHaveLength(0)
  })
})

describe('collectSaasRenewalAlerts', () => {
  it('更新期限2ヶ月以内の契約をwarningで検出する', () => {
    const alerts = collectSaasRenewalAlerts(
      [
        {
          id: 'c1',
          name: 'GitHub',
          plan: 'Enterprise',
          nextRenewalDate: '2026-09-30',
        },
      ],
      new Date(2026, 7, 15),
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.message).toContain('GitHub（Enterprise）')
  })

  it('反証: 更新期限まで余裕がある契約は検出しない', () => {
    const alerts = collectSaasRenewalAlerts(
      [{ id: 'c1', name: 'GitHub', nextRenewalDate: '2027-03-31' }],
      new Date(2026, 7, 15),
    )
    expect(alerts).toHaveLength(0)
  })
})

describe('collectBudgetOverrunAlerts', () => {
  it('消化率80%以上でwarning、100%以上でcritical', () => {
    const alerts = collectBudgetOverrunAlerts([
      {
        projectId: 'p1',
        name: '警告圏',
        contractAmount: 1000,
        actualCostTotal: 850,
      },
      {
        projectId: 'p2',
        name: '赤字圏',
        contractAmount: 1000,
        actualCostTotal: 1200,
      },
    ])
    expect(alerts).toHaveLength(2)
    expect(alerts.find((a) => a.key.includes('p1'))?.severity).toBe('warning')
    expect(alerts.find((a) => a.key.includes('p2'))?.severity).toBe('critical')
  })

  // 反証: 受注金額未設定（0）の案件は判定不能であり、警告を出すと誤報だらけになる
  it('反証: 受注金額が0以下の案件は対象外', () => {
    const alerts = collectBudgetOverrunAlerts([
      {
        projectId: 'p1',
        name: '未設定',
        contractAmount: 0,
        actualCostTotal: 500,
      },
    ])
    expect(alerts).toHaveLength(0)
  })

  it('反証: 消化率80%未満は検出しない', () => {
    const alerts = collectBudgetOverrunAlerts([
      {
        projectId: 'p1',
        name: '健全',
        contractAmount: 1000,
        actualCostTotal: 500,
      },
    ])
    expect(alerts).toHaveLength(0)
  })
})

describe('collectUpcomingDueDateAlerts', () => {
  const TODAY = '2026-06-01'
  function makeInput(
    overrides: Partial<{
      masterDueDate: string | null
      status: 'not_started' | 'active' | 'completed'
    }> = {},
  ) {
    return {
      id: PROJECT_ID,
      name: 'ECサイト構築',
      masterDueDate: '2026-06-10' as string | null,
      status: 'active' as const,
      ...overrides,
    }
  }

  it('閾値日数ちょうど先の納期はinfoで知らせる（境界値）', () => {
    // TODAY + 14日 = 2026-06-15
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ masterDueDate: '2026-06-15' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('info')
    expect(alerts[0]?.category).toBe('納期')
    expect(alerts[0]?.message).toContain(`あと${DUE_SOON_THRESHOLD_DAYS}日`)
  })

  it('閾値より1日先の納期は出さない（境界値の反証）', () => {
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ masterDueDate: '2026-06-16' })],
      TODAY,
    )
    expect(alerts).toHaveLength(0)
  })

  it('納期当日は「本日です」として知らせる', () => {
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ masterDueDate: TODAY })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.message).toContain('本日です')
  })

  it('納期を過ぎた案件は出さない（超過criticalとの二重通知をしない反証）', () => {
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ masterDueDate: '2026-05-31' })],
      TODAY,
    )
    expect(alerts).toHaveLength(0)
  })

  it('完了済み案件は納期が近くても出さない', () => {
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ status: 'completed' })],
      TODAY,
    )
    expect(alerts).toHaveLength(0)
  })

  it('マスター納期未設定の案件は対象外', () => {
    const alerts = collectUpcomingDueDateAlerts(
      [makeInput({ masterDueDate: null })],
      TODAY,
    )
    expect(alerts).toHaveLength(0)
  })
})

describe('collectBillingAcceptanceAlerts', () => {
  const TODAY = '2026-06-01'
  const MILESTONE_ID = crypto.randomUUID()
  function makeMilestone(
    overrides: Partial<BillingAcceptanceAlertInput> = {},
  ): BillingAcceptanceAlertInput {
    return {
      id: MILESTONE_ID,
      label: '中間金',
      projectName: 'ECサイト構築',
      plannedAcceptanceDate: '2026-06-10',
      status: 'planned',
      ...overrides,
    }
  }

  it('閾値日数ちょうど先の検収予定日はinfoで知らせる（境界値）', () => {
    const alerts = collectBillingAcceptanceAlerts(
      [makeMilestone({ plannedAcceptanceDate: '2026-06-15' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('info')
    expect(alerts[0]?.category).toBe('商流')
    expect(alerts[0]?.message).toContain('中間金')
  })

  it('閾値より1日先は出さない（境界値の反証）', () => {
    const alerts = collectBillingAcceptanceAlerts(
      [makeMilestone({ plannedAcceptanceDate: '2026-06-16' })],
      TODAY,
    )
    expect(alerts).toHaveLength(0)
  })

  it('検収予定日当日は「本日です」として知らせる', () => {
    const alerts = collectBillingAcceptanceAlerts(
      [makeMilestone({ plannedAcceptanceDate: TODAY })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('info')
    expect(alerts[0]?.message).toContain('本日です')
  })

  it('検収予定日を過ぎたplannedはwarningへ切り替わる（接近だけだと予定日経過で無音になる反証）', () => {
    const alerts = collectBillingAcceptanceAlerts(
      [makeMilestone({ plannedAcceptanceDate: '2026-05-31' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('warning')
    expect(alerts[0]?.message).toContain('過ぎても検収されていません')
  })

  it('検収済み以降（accepted/invoiced/paid）は予定日を過ぎていても出さない', () => {
    for (const status of ['accepted', 'invoiced', 'paid'] as const) {
      const alerts = collectBillingAcceptanceAlerts(
        [makeMilestone({ status, plannedAcceptanceDate: '2026-05-01' })],
        TODAY,
      )
      expect(alerts).toHaveLength(0)
    }
  })

  it('文面に金額を含める入力経路が存在しない（決定事項7の構造的担保）', () => {
    // BillingAcceptanceAlertInputは金額フィールド自体を持たないため、
    // どんな入力でも文面に金額は現れない（型で保証されることの明示）
    const alerts = collectBillingAcceptanceAlerts([makeMilestone()], TODAY)
    expect(alerts[0]?.message).not.toMatch(/万円|[0-9,]+円/)
  })
})

describe('collectRiskDueDateAlerts', () => {
  const TODAY = '2026-06-01'
  const RISK_ID = crypto.randomUUID()
  function makeRisk(
    overrides: Partial<{
      status: 'open' | 'realized' | 'closed'
      dueDate: string | null
    }> = {},
  ) {
    return {
      id: RISK_ID,
      title: '仕様未確定',
      projectName: 'ECサイト構築',
      status: 'open' as const,
      dueDate: '2026-06-10' as string | null,
      ...overrides,
    }
  }

  it('対応期限を過ぎたopenリスクはwarningになる', () => {
    const alerts = collectRiskDueDateAlerts(
      [makeRisk({ dueDate: '2026-05-31' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('warning')
    expect(alerts[0]?.category).toBe('リスク')
    expect(alerts[0]?.message).toContain('過ぎています')
  })

  it('realized（顕在化）も期限管理の対象になる', () => {
    const alerts = collectRiskDueDateAlerts(
      [makeRisk({ status: 'realized', dueDate: '2026-05-01' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
  })

  it('閾値日数以内の期限はinfoで知らせる（境界値: ちょうど14日）', () => {
    const alerts = collectRiskDueDateAlerts(
      [makeRisk({ dueDate: '2026-06-15' })],
      TODAY,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('info')
    expect(alerts[0]?.message).toContain(`あと${DUE_SOON_THRESHOLD_DAYS}日`)
  })

  it('閾値より1日先は出さない（境界値の反証）', () => {
    expect(
      collectRiskDueDateAlerts([makeRisk({ dueDate: '2026-06-16' })], TODAY),
    ).toHaveLength(0)
  })

  it('closed（解消済み）は期限を過ぎていても出さない（反証）', () => {
    expect(
      collectRiskDueDateAlerts(
        [makeRisk({ status: 'closed', dueDate: '2026-01-01' })],
        TODAY,
      ),
    ).toHaveLength(0)
  })

  it('期限未設定のリスクは対象外（反証）', () => {
    expect(
      collectRiskDueDateAlerts([makeRisk({ dueDate: null })], TODAY),
    ).toHaveLength(0)
  })
})
