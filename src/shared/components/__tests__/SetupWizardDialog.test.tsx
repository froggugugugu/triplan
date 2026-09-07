import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAppStore,
  useBudgetStore,
  useMembersStore,
  useProjectsStore,
  useTeamStore,
} from '@/stores'
import { SetupWizardDialog } from '../SetupWizardDialog'

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

function renderWizard() {
  return render(
    <MemoryRouter>
      <SetupWizardDialog />
    </MemoryRouter>,
  )
}

function resetStores(options?: { open?: boolean }) {
  localStorage.clear()
  useAppStore.setState({
    isSetupWizardOpen: options?.open ?? true,
    setupWizardInitialStep: 'welcome',
    demoDataActive: false,
    setupCardDismissed: false,
  })
  useProjectsStore.setState({ projects: [] })
  useMembersStore.setState({ members: [] })
  useTeamStore.setState({ divisions: [], sections: [] })
}

describe('SetupWizardDialog', () => {
  beforeEach(() => resetStores())
  afterEach(() => cleanup())

  it('空データのようこそ画面ではデモ分岐と自分のデータの2択を表示する', () => {
    renderWizard()
    expect(screen.getByText('デモデータで試す')).toBeInTheDocument()
    expect(screen.getByText('自分のデータで始める')).toBeInTheDocument()
  })

  it('反証: 実データがある場合はデモボタンを表示しない（誤爆上書き防止）', () => {
    useTeamStore.setState({
      divisions: [
        {
          id: crypto.randomUUID(),
          name: '既存部門',
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    renderWizard()
    expect(screen.queryByText('デモデータで試す')).not.toBeInTheDocument()
    expect(screen.getByText('設定を続ける')).toBeInTheDocument()
  })

  it('基本設定→組織→担当者→プロジェクトの完走で、各エンティティがstoreへ作成される', async () => {
    const user = userEvent.setup()
    renderWizard()

    // ようこそ → 基本設定
    await user.click(screen.getByText('自分のデータで始める'))
    expect(screen.getByText(/基本設定/)).toBeInTheDocument()
    const unitPriceInput = screen.getByLabelText('概算単価（万円）')
    await user.clear(unitPriceInput)
    await user.type(unitPriceInput, '90')
    await user.click(screen.getByRole('button', { name: '次へ' }))

    // 組織
    await user.type(screen.getByLabelText('部門名'), '開発部')
    await user.type(screen.getByLabelText('課名1'), '第1開発課')
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(useTeamStore.getState().divisions).toHaveLength(1)
    expect(useTeamStore.getState().sections).toHaveLength(1)
    const division = useTeamStore.getState().divisions[0]
    const section = useTeamStore.getState().sections[0]
    expect(section?.divisionId).toBe(division?.id)

    // 担当者（課を選択し単価も入力）
    await user.type(screen.getByLabelText('担当者名1'), '田中太郎')
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '第1開発課' }))
    const priceInput = screen.getByLabelText('単価1（万円）')
    await user.clear(priceInput)
    await user.type(priceInput, '80')
    await user.click(screen.getByRole('button', { name: '次へ' }))
    const members = useMembersStore.getState().members
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({
      name: '田中太郎',
      sectionId: section?.id,
      isActive: true,
    })
    expect(members[0]?.unitPriceHistory).toHaveLength(1)
    expect(members[0]?.unitPriceHistory[0]?.amount).toBe(80)

    // プロジェクト（標準テンプレート適用ON）
    await user.type(screen.getByLabelText('プロジェクト名'), '基幹システム刷新')
    await user.click(screen.getByRole('button', { name: '作成して完了' }))

    const projects = useProjectsStore.getState().projects
    const root = projects.find((p) => p.level === 0)
    expect(root).toMatchObject({
      code: 'P001',
      name: '基幹システム刷新',
      // 作成した部門が担当部門として自動設定される（EVM・部門予算集計の対象になる）
      divisionId: division?.id,
    })
    // 標準テンプレート（14工程＋成果物ノード）が配下に一括生成される
    expect(projects.length).toBeGreaterThan(10)
    expect(projects.some((p) => p.parentId === root?.id)).toBe(true)

    // 概算単価が基本設定ステップで保存されている
    expect(useBudgetStore.getState().estimatedUnitPrice).toBe(90)

    // 完了画面
    expect(screen.getByText('セットアップ完了')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'WBSを開く' }),
    ).toBeInTheDocument()
  })

  it('反証: 全ステップをスキップするとエンティティは一切作成されない', async () => {
    const user = userEvent.setup()
    renderWizard()
    await user.click(screen.getByText('自分のデータで始める'))
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'スキップ' }))
    }
    expect(screen.getByText('セットアップ完了')).toBeInTheDocument()
    expect(useTeamStore.getState().divisions).toHaveLength(0)
    expect(useMembersStore.getState().members).toHaveLength(0)
    expect(useProjectsStore.getState().projects).toHaveLength(0)
  })

  it('反証: プロジェクト名が空白のみなら作成しない（ボタンは「完了」表示）', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ setupWizardInitialStep: 'basics' })
    renderWizard()
    await user.click(screen.getByRole('button', { name: '次へ' })) // basics
    await user.click(screen.getByRole('button', { name: 'スキップ' })) // organization
    await user.click(screen.getByRole('button', { name: 'スキップ' })) // members
    await user.type(screen.getByLabelText('プロジェクト名'), '   ')
    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(useProjectsStore.getState().projects).toHaveLength(0)
  })

  it('デモ試用中のようこそ画面: 確認を経て全データ削除→基本設定ステップへ進み、フラグが解除される', async () => {
    const user = userEvent.setup()
    // デモ相当のデータを仕込む
    useAppStore.setState({ demoDataActive: true })
    useProjectsStore.setState({
      projects: [
        {
          id: crypto.randomUUID(),
          code: 'P900',
          name: 'デモ案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    renderWizard()

    expect(screen.getByText(/デモデータで試用中/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '本番データへ切り替える' }),
    )
    // 確認UI（破壊的操作の二段階確認・退避手段の案内）
    const confirm = screen.getByText(/この操作は取り消せません/)
    expect(confirm).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '削除して本番データへ切り替える' }),
    )

    expect(useProjectsStore.getState().projects).toHaveLength(0)
    expect(useAppStore.getState().demoDataActive).toBe(false)
    expect(screen.getByText(/基本設定/)).toBeInTheDocument()
  })

  it('反証: 切り替え確認でキャンセルするとデータは残りデモ試用中のまま', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ demoDataActive: true })
    const project = {
      id: crypto.randomUUID(),
      code: 'P900',
      name: 'デモ案件',
      parentId: null,
      level: 0 as const,
      status: 'active' as const,
      confidence: null,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    useProjectsStore.setState({ projects: [project] })
    renderWizard()

    await user.click(
      screen.getByRole('button', { name: '本番データへ切り替える' }),
    )
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(useProjectsStore.getState().projects).toHaveLength(1)
    expect(useAppStore.getState().demoDataActive).toBe(true)
  })

  it('担当者ステップ: 単価未入力の行はunitPriceHistoryが空配列で登録される（0円履歴を作らない）', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ setupWizardInitialStep: 'basics' })
    renderWizard()
    await user.click(screen.getByRole('button', { name: '次へ' })) // basics
    await user.click(screen.getByRole('button', { name: 'スキップ' })) // organization
    await user.type(screen.getByLabelText('担当者名1'), '単価未定さん')
    await user.click(screen.getByRole('button', { name: '次へ' }))
    const member = useMembersStore.getState().members[0]
    expect(member?.name).toBe('単価未定さん')
    expect(member?.unitPriceHistory).toEqual([])
    expect(member?.sectionId).toBeNull()
  })
})
