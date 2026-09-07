import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaasContract } from '@/shared/types/budget'
import { useBudgetStore, useTeamStore } from '@/stores'
import { SaasContractTable } from '../SaasContractTable'

vi.mock('@/stores', () => ({
  useBudgetStore: vi.fn(),
  useTeamStore: vi.fn(),
}))

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

afterEach(() => cleanup())

const DIVISION_A = crypto.randomUUID()
const DIVISION_B = crypto.randomUUID()

function createContract(overrides: Partial<SaasContract> = {}): SaasContract {
  return {
    id: crypto.randomUUID(),
    name: 'Test SaaS',
    plan: null,
    divisionId: DIVISION_A,
    contractType: 'annual',
    amount: 1200,
    headcount: null,
    unitPrice: null,
    amountHistory: [],
    monthlyActuals: {},
    paymentCycle: 'annual',
    contractStartDate: '2025-04-01',
    nextRenewalDate: '2026-03-31',
    note: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('SaasContractTable', () => {
  let saasContracts: SaasContract[]

  beforeEach(() => {
    saasContracts = []

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useTeamStore).mockImplementation((selector: any) =>
      selector({
        divisions: [
          { id: DIVISION_A, name: '部門A', sortOrder: 0 },
          { id: DIVISION_B, name: '部門B', sortOrder: 1 },
        ],
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    vi.mocked(useBudgetStore).mockImplementation((selector: any) =>
      selector({
        saasContracts,
        deleteSaasContract: vi.fn(),
      }),
    )
  })

  it('契約が0件の場合は空状態メッセージを表示する', () => {
    render(<SaasContractTable fiscalYear={2025} startMonth={4} />)
    expect(
      screen.getByText('SaaS契約が登録されていません。'),
    ).toBeInTheDocument()
  })

  it('divisionId未指定（propなし）の場合は全部門の契約を表示する（後方互換）', () => {
    saasContracts = [
      createContract({ name: 'Service A', divisionId: DIVISION_A }),
      createContract({ name: 'Service B', divisionId: DIVISION_B }),
    ]
    render(<SaasContractTable fiscalYear={2025} startMonth={4} />)
    expect(screen.getByText('Service A')).toBeInTheDocument()
    expect(screen.getByText('Service B')).toBeInTheDocument()
  })

  it('divisionIdを指定すると、一致する部門の契約のみ表示する', () => {
    saasContracts = [
      createContract({ name: 'Service A', divisionId: DIVISION_A }),
      createContract({ name: 'Service B', divisionId: DIVISION_B }),
    ]
    render(
      <SaasContractTable
        fiscalYear={2025}
        startMonth={4}
        divisionId={DIVISION_A}
      />,
    )
    expect(screen.getByText('Service A')).toBeInTheDocument()
    expect(screen.queryByText('Service B')).not.toBeInTheDocument()
  })

  // 反証: 一致する契約が1件も無い場合は空状態メッセージに切り替わる
  it('反証: divisionIdに一致する契約が1件も無い場合は空状態メッセージを表示する', () => {
    saasContracts = [
      createContract({ name: 'Service B', divisionId: DIVISION_B }),
    ]
    render(
      <SaasContractTable
        fiscalYear={2025}
        startMonth={4}
        divisionId={DIVISION_A}
      />,
    )
    expect(
      screen.getByText('SaaS契約が登録されていません。'),
    ).toBeInTheDocument()
  })

  // 反証: divisionId=null（全部門）の場合は部門に関わらず全契約が対象になる
  it('反証: divisionId=null（全部門）の場合は部門に関わらず全契約が対象になる', () => {
    saasContracts = [
      createContract({ name: 'Service A', divisionId: DIVISION_A }),
      createContract({ name: 'Service B', divisionId: DIVISION_B }),
    ]
    render(
      <SaasContractTable fiscalYear={2025} startMonth={4} divisionId={null} />,
    )
    expect(screen.getByText('Service A')).toBeInTheDocument()
    expect(screen.getByText('Service B')).toBeInTheDocument()
  })
})
