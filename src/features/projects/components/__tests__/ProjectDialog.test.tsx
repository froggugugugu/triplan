import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listExternalToolConnections } from '@/shared/api/external-tools-api'
import type { Project } from '@/shared/types'
import { ProjectDialog } from '../ProjectDialog'

const mockAddProject = vi.fn()
const mockUpdateProject = vi.fn()
// コード一意性検証のテスト用。vi.mockのファクトリ内から
// 遅延評価で参照されるため、テストごとに差し替えられる
// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
let mockProjects: any[] = []

const mockDivisions = [
  {
    id: 'div-1',
    name: '開発部',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'div-2',
    name: '営業部',
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
]

/** 所属工程セレクタ用の工程定義。テストごとに差し替えられる */
// biome-ignore lint/suspicious/noExplicitAny: テストのモック設定
let mockPhaseSettingsEntries: any[] = []

// モックストア
vi.mock('@/stores', () => {
  // vi.mockはファイル先頭へホイストされるため、mockAddProject等のトップレベル変数は
  // 関数内（呼び出し時評価）でのみ参照する
  const getProjectsState = () => ({
    projects: mockProjects,
    addProject: mockAddProject,
    updateProject: mockUpdateProject,
  })
  // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
  const useProjectsStoreMock = (selector: (state: any) => any) =>
    selector(getProjectsState())
  // onSubmitのコード一意性検証がgetState()経由で全プロジェクトを
  // 参照するため、フックとしてのモックにgetStateも生やす
  useProjectsStoreMock.getState = getProjectsState
  return {
    useProjectsStore: useProjectsStoreMock,
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    useTeamStore: (selector: (state: any) => any) => {
      const state = { divisions: mockDivisions }
      return selector(state)
    },
    // 所属工程セレクタが参照する工程定義
    // biome-ignore lint/suspicious/noExplicitAny: テストのモック設定で型推論が複雑なため
    useScheduleSettingsStore: (selector: (state: any) => any) => {
      const state = {
        entries: mockPhaseSettingsEntries,
        getSettings: (projectId: string) => ({
          phases:
            mockPhaseSettingsEntries.find((e) => e.projectId === projectId)
              ?.phases ?? [],
          lastModified: '2025-09-01T00:00:00.000Z',
        }),
      }
      return selector(state)
    },
  }
})

// モックトースト
vi.mock('@/shared/api/external-tools-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/api/external-tools-api')
  >('@/shared/api/external-tools-api')
  return {
    ...actual,
    listExternalToolConnections: vi.fn(async () => [
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        tool: 'asana' as const,
        name: 'Asana本番',
        baseUrl: null,
        authEmail: null,
        apiTokenConfigured: true,
        targetConfig: null,
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-0000000000d2',
        tool: 'github' as const,
        name: 'GitHub社内',
        baseUrl: null,
        authEmail: null,
        apiTokenConfigured: true,
        targetConfig: null,
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  }
})

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}))

const PARENT_PROJECT_ID = '00000000-0000-4000-8000-000000000101'

const mockParentProject: Project = {
  id: PARENT_PROJECT_ID,
  code: 'P001',
  name: '親プロジェクト',
  description: '',
  background: '',
  purpose: '',
  parentId: null,
  level: 0,
  status: 'active',
  confidence: 'S',
  completed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('ProjectDialog', () => {
  describe('ダイアログタイトル', () => {
    it('level=0（プロジェクト）の場合、新規時は「新規プロジェクト」を表示', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByText('新規プロジェクト')).toBeInTheDocument()
    })

    it('level>0（タスク）の場合、新規時は「新規タスク」を表示', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.getByText('新規タスク')).toBeInTheDocument()
    })

    it('level=0の編集時は「プロジェクトを編集」を表示', () => {
      const project: Project = {
        ...mockParentProject,
        id: 'proj-1',
        level: 0,
      }

      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} project={project} />,
      )

      expect(screen.getByText('プロジェクトを編集')).toBeInTheDocument()
    })

    it('level>0の編集時は「タスクを編集」を表示', () => {
      const task: Project = {
        ...mockParentProject,
        id: '00000000-0000-4000-8000-000000000102',
        code: 'P001-01',
        name: 'タスク1',
        parentId: PARENT_PROJECT_ID,
        level: 1,
      }

      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} project={task} />,
      )

      expect(screen.getByText('タスクを編集')).toBeInTheDocument()
    })
  })

  describe('プロジェクト名/タスク名ラベル', () => {
    it('level=0の場合、ラベルは「プロジェクト名」', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByLabelText('プロジェクト名')).toBeInTheDocument()
    })

    it('level>0の場合、ラベルは「タスク名」', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.getByLabelText('タスク名')).toBeInTheDocument()
    })
  })

  describe('プロジェクト確度フィールド', () => {
    it('level=0の場合、プロジェクト確度フィールドが表示される', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByText('プロジェクト確度')).toBeInTheDocument()
    })

    it('level>0の場合、プロジェクト確度フィールドが非表示', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.queryByText('プロジェクト確度')).not.toBeInTheDocument()
    })

    it('level=2の場合も、プロジェクト確度フィールドが非表示', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={2}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.queryByText('プロジェクト確度')).not.toBeInTheDocument()
    })
  })

  describe('コード一意性の検証（非公開の設計文書）', () => {
    it('反証: 編集でコードを既存プロジェクトと重複する値へ変更できない（updateProject非呼び出し）', async () => {
      // コード入力欄は新規時disabled（自動採番固定）のため、重複を作れるのは編集経路のみ
      mockProjects = [
        { id: 'a1', code: 'P001', name: '既存', parentId: null, level: 0 },
        { id: 'a2', code: 'P002', name: '編集対象', parentId: null, level: 0 },
      ]
      const user = userEvent.setup()
      const project = {
        id: 'a2',
        code: 'P002',
        name: '編集対象',
        parentId: null,
        level: 0 as const,
        status: 'active' as const,
        confidence: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={0}
          // biome-ignore lint/suspicious/noExplicitAny: テスト用の最小Project
          project={project as any}
        />,
      )
      const codeInput = screen.getByLabelText('プロジェクトコード')
      await user.clear(codeInput)
      await user.type(codeInput, 'P001')
      await user.click(screen.getByRole('button', { name: '更新' }))

      expect(mockUpdateProject).not.toHaveBeenCalled()
      mockProjects = []
    })

    it('編集時にコードが不変なら、他プロジェクトと重複していてもブロックしない（既存不整合を対象外にする）', async () => {
      // 既にP001が2件ある既存不整合状態で、片方の名前だけを変える編集は通る
      mockProjects = [
        { id: 'a1', code: 'P001', name: 'その1', parentId: null, level: 0 },
        { id: 'a2', code: 'P001', name: 'その2', parentId: null, level: 0 },
      ]
      const user = userEvent.setup()
      const project = {
        id: 'a1',
        code: 'P001',
        name: 'その1',
        parentId: null,
        level: 0 as const,
        status: 'active' as const,
        confidence: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={0}
          // biome-ignore lint/suspicious/noExplicitAny: テスト用の最小Project
          project={project as any}
        />,
      )
      await user.clear(screen.getByLabelText(/プロジェクト名/))
      await user.type(screen.getByLabelText(/プロジェクト名/), '改名のみ')
      await user.click(screen.getByRole('button', { name: '更新' }))

      expect(mockUpdateProject).toHaveBeenCalled()
      mockProjects = []
    })
  })

  /**
   * 案件ごとの既定接続。
   * 「A案件はAsana、B案件はGitHub」のように案件ごとに委譲先が違う運用で、
   * 起票のたびに接続を選ばせない＝取り違えて別ツールへ起票する事故を防ぐ。
   */
  describe('起票先の接続フィールド', () => {
    const ORIGINAL_MODE = import.meta.env.VITE_STORAGE_MODE

    afterEach(() => {
      vi.stubEnv('VITE_STORAGE_MODE', ORIGINAL_MODE ?? 'local')
    })

    it('postgresモードのlevel=0では接続を選べる', async () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )
      expect(await screen.findByText('起票先の接続')).toBeInTheDocument()
    })

    it('反証: localモードでは接続欄を出さない（接続はサーバー専用エンティティ）', () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'local')
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )
      expect(screen.queryByText('起票先の接続')).not.toBeInTheDocument()
    })

    it('反証: タスク（level>0）には接続欄を出さない（案件単位の設定のため）', async () => {
      vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
      // 他のテストの呼び出しが残ると「呼ばれていない」の検証が成立しない
      vi.mocked(listExternalToolConnections).mockClear()
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )
      // 「出ないこと」の確認なので、非同期の接続取得が終わる余地を与えてから見る
      // （待たずに確認すると、まだ描画されていないだけで通ってしまう）
      await screen.findByLabelText('タスク名')
      await waitFor(() =>
        expect(listExternalToolConnections).not.toHaveBeenCalled(),
      )
      expect(screen.queryByText('起票先の接続')).not.toBeInTheDocument()
    })
  })

  describe('担当部門フィールド', () => {
    it('level=0の場合、担当部門フィールドが表示される', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByText('担当部門')).toBeInTheDocument()
    })

    it('level>0（タスク）の場合、担当部門フィールドが非表示', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.queryByText('担当部門')).not.toBeInTheDocument()
    })

    it('編集時、既存のdivisionIdが選択済みとして表示される', () => {
      const project: Project = {
        ...mockParentProject,
        id: 'proj-1',
        level: 0,
        divisionId: 'div-2',
      }

      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} project={project} />,
      )

      expect(screen.getByText('営業部')).toBeInTheDocument()
    })

    // 反証: level>0のタスクを送信した場合、divisionIdが誤って設定されず
    // 常にnullで送信されるか（UI非表示のフィールドが古い値を引きずらないか）
    it('level>0（タスク）を送信すると担当部門はnullで保存される', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )
      await user.type(screen.getByLabelText('タスク名'), 'テストタスク')
      await user.click(screen.getByRole('button', { name: '追加' }))

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({ divisionId: null }),
      )
    })
  })

  describe('所属工程フィールド', () => {
    beforeEach(() => {
      mockProjects = [mockParentProject]
      mockPhaseSettingsEntries = [
        {
          projectId: PARENT_PROJECT_ID,
          phases: [
            {
              phaseKey: 'phase-1',
              name: '要件定義',
              enabled: true,
              sortOrder: 0,
              color: '#0017c1',
            },
            {
              phaseKey: 'phase-2',
              name: '基本設計',
              enabled: true,
              sortOrder: 1,
              color: '#0017c1',
            },
            {
              phaseKey: 'phase-3',
              name: '使っていない工程',
              enabled: false,
              sortOrder: 2,
              color: '#0017c1',
            },
          ],
        },
      ]
    })

    afterEach(() => {
      mockProjects = []
      mockPhaseSettingsEntries = []
      mockAddProject.mockClear()
    })

    it('level>0（タスク）の場合、所属工程フィールドが表示される', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.getByText('所属工程')).toBeInTheDocument()
    })

    it('反証: level=0（プロジェクト）では所属工程フィールドを表示しない（案件自身は工程に属さない）', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.queryByText('所属工程')).not.toBeInTheDocument()
    })

    it('反証: 有効な工程が1つも無ければフィールドごと表示しない（選べない空セレクタを出さない）', () => {
      mockPhaseSettingsEntries = [
        {
          projectId: PARENT_PROJECT_ID,
          phases: [
            {
              phaseKey: 'phase-1',
              name: '無効な工程',
              enabled: false,
              sortOrder: 0,
              color: '#0017c1',
            },
          ],
        },
      ]

      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.queryByText('所属工程')).not.toBeInTheDocument()
    })

    it('反証: 無効化された工程は選択肢に現れない', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      // 「未設定（上位から継承）」がトリガーの初期表示。クリックで選択肢を開く
      await user.click(screen.getByText('未設定（上位から継承）'))

      expect(screen.getByText('要件定義')).toBeInTheDocument()
      expect(screen.getByText('基本設計')).toBeInTheDocument()
      expect(screen.queryByText('使っていない工程')).not.toBeInTheDocument()
    })

    it('反証: 工程を選ばずに送信するとphaseKeyはnull（未設定＝上位から継承の意味を保つ）', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )
      await user.type(screen.getByLabelText('タスク名'), 'テストタスク')
      await user.click(screen.getByRole('button', { name: '追加' }))

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({ phaseKey: null }),
      )
    })

    it('反証: level=0を送信するとphaseKeyは常にnull（UI非表示のフィールドが値を持ち込まない）', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )
      await user.type(screen.getByLabelText('プロジェクト名'), 'テスト案件')
      await user.click(screen.getByRole('button', { name: '追加' }))

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({ phaseKey: null }),
      )
    })

    it('編集時、既存のphaseKeyが選択済みとして表示される', () => {
      const task: Project = {
        ...mockParentProject,
        id: 'task-1',
        code: 'P001-01',
        name: '設計タスク',
        parentId: PARENT_PROJECT_ID,
        level: 1,
        phaseKey: 'phase-2',
      }
      mockProjects = [mockParentProject, task]

      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} project={task} />,
      )

      expect(screen.getByText('基本設計')).toBeInTheDocument()
    })

    it('親が工程を持つ場合、継承元の工程名をプレースホルダに表示する', () => {
      const parentTask: Project = {
        ...mockParentProject,
        id: 'parent-task',
        code: 'P001-01',
        name: '設計工程',
        parentId: PARENT_PROJECT_ID,
        level: 1,
        phaseKey: 'phase-2',
      }
      mockProjects = [mockParentProject, parentTask]

      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={2}
          parentProject={parentTask}
        />,
      )

      expect(screen.getByText('上位から継承（基本設計）')).toBeInTheDocument()
    })
  })

  describe('ステータスフィールド', () => {
    it('level=0でもlevel>0でも、ステータスフィールドは常に表示される', () => {
      const { rerender } = render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByText('ステータス')).toBeInTheDocument()

      rerender(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.getByText('ステータス')).toBeInTheDocument()
    })
  })

  describe('発注元・受注金額・優先度フィールド（人・モノ・金の三位一体強化）', () => {
    it('level=0の場合、発注元・受注金額・優先度フィールドが表示される', () => {
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      expect(screen.getByLabelText('発注元')).toBeInTheDocument()
      expect(screen.getByText('優先度')).toBeInTheDocument()
      expect(screen.getByLabelText('受注金額（万円）')).toBeInTheDocument()
    })

    it('level>0（タスク）の場合、発注元・受注金額・優先度フィールドが非表示', () => {
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )

      expect(screen.queryByLabelText('発注元')).not.toBeInTheDocument()
      expect(screen.queryByText('優先度')).not.toBeInTheDocument()
      expect(
        screen.queryByLabelText('受注金額（万円）'),
      ).not.toBeInTheDocument()
    })

    it('編集時、既存のclientName/contractAmountが入力欄に表示される', () => {
      const project: Project = {
        ...mockParentProject,
        id: 'proj-1',
        level: 0,
        clientName: '株式会社サンプル',
        contractAmount: 800,
      }

      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} project={project} />,
      )

      expect(screen.getByLabelText('発注元')).toHaveValue('株式会社サンプル')
      expect(screen.getByLabelText('受注金額（万円）')).toHaveValue('800')
    })

    // 反証: level>0（タスク）を送信した場合、clientName/contractAmount/priorityが
    // 誤って設定されず常にnullで送信されるか（UI非表示のフィールドが古い値を引きずらないか）
    it('level>0（タスク）を送信すると発注元・受注金額・優先度はnullで保存される', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          defaultLevel={1}
          parentProject={mockParentProject}
        />,
      )
      await user.type(screen.getByLabelText('タスク名'), 'テストタスク')
      await user.click(screen.getByRole('button', { name: '追加' }))

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: null,
          contractAmount: null,
          priority: null,
        }),
      )
    })

    it('発注元・受注金額を入力して送信すると、その値でaddProjectが呼ばれる', async () => {
      const user = userEvent.setup()
      render(
        <ProjectDialog open={true} onOpenChange={vi.fn()} defaultLevel={0} />,
      )

      await user.type(screen.getByLabelText('プロジェクト名'), 'テスト案件')
      await user.type(screen.getByLabelText('発注元'), '株式会社サンプル')
      await user.click(screen.getByRole('button', { name: '追加' }))

      expect(mockAddProject).toHaveBeenCalledWith(
        expect.objectContaining({ clientName: '株式会社サンプル' }),
      )
    })
  })
})
