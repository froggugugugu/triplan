import { create } from 'zustand'
import { ApiError, getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  CreateProject,
  Project,
  ProjectTreeNode,
  UpdateProject,
} from '@/shared/types'
import { migrateProjectLevel } from '@/shared/types/project'
import { useActualsStore } from './actuals-store'
import { useAssignmentStore } from './assignment-store'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

interface ProjectsState {
  projects: Project[]
  // Actions
  loadProjects: () => void
  addProject: (data: CreateProject) => Project
  updateProject: (data: UpdateProject) => void
  updateProjectsBatch: (updates: UpdateProject[]) => void
  deleteProject: (id: string) => void
  // Selectors
  getProjectById: (id: string) => Project | undefined
  getProjectsByLevel: (level: Project['level']) => Project[]
  getProjectsByParentId: (parentId: string | null) => Project[]
  getProjectTree: () => ProjectTreeNode[]
}

/**
 * 案件をツリー構造に変換
 */
function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const nodeMap = new Map<string, ProjectTreeNode>()

  // まず全ノードを作成
  for (const project of projects) {
    nodeMap.set(project.id, {
      ...project,
      children: [],
      depth: typeof project.level === 'number' ? project.level : 0,
    })
  }

  // 親子関係を構築
  const roots: ProjectTreeNode[] = []
  for (const project of projects) {
    const node = nodeMap.get(project.id)
    if (!node) continue

    if (project.parentId) {
      const parent = nodeMap.get(project.parentId)
      if (parent) {
        parent.children.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  // 各レベルをコードでソート
  const sortNodes = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code))
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }
  sortNodes(roots)

  return roots
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `プロジェクトの${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],

  loadProjects: () => {
    getDataAdapter()
      .list('projects')
      .then((projects) => {
        // マイグレーション: 旧文字列レベルを数値に変換
        const migrated = projects.map((p) => ({
          ...p,
          level: migrateProjectLevel(p.level as string | number),
        }))
        set({ projects: migrated })
      })
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（docs/project.md「17ストアのDataAdapter配線」参照）。戻り値idを同期的に
  // 連鎖利用する呼び出し元（`applyWbsTemplate`のparentId連鎖）があるため、
  // create()のoptions.idで確定id同様に固定し、戻り値は楽観的set()直後の値をそのまま返す
  addProject: (data) => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newProject: Project = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ projects: [...state.projects, newProject] }))
    getDataAdapter()
      .create('projects', { ...data, createdAt: now, updatedAt: now }, { id })
      .then((created) => {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? created : p)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return newProject
  },

  updateProject: (data) => {
    const previous = get().projects
    const now = new Date().toISOString()
    set({
      projects: previous.map((p) =>
        p.id === data.id ? { ...p, ...data, updatedAt: now } : p,
      ),
    })
    const { id, ...patch } = data
    getDataAdapter()
      .update(
        'projects',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック: 画面が見ていた版と食い違えばサーバーが412で拒否する
        { expectedUpdatedAt: previous.find((p) => p.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          projects: state.projects.map((x) => (x.id === id ? saved : x)),
        }))
      })
      .catch((error: unknown) => {
        set({ projects: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  updateProjectsBatch: (updates) => {
    if (updates.length === 0) return
    const previous = get().projects
    const now = new Date().toISOString()
    const updateMap = new Map(updates.map((u) => [u.id, u]))
    set({
      projects: previous.map((p) => {
        const u = updateMap.get(p.id)
        return u ? { ...p, ...u, updatedAt: now } : p
      }),
    })
    getDataAdapter()
      .bulkUpdate(
        'projects',
        updates.map(({ id, ...patch }) => ({
          id,
          patch: { ...patch, updatedAt: now },
        })),
      )
      .catch((error: unknown) => {
        set({ projects: previous })
        notifyPersistenceFailure('一括更新', error)
      })
  },

  deleteProject: (id) => {
    const previous = get().projects
    // 子案件も一緒に削除
    const idsToDelete = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const p of previous) {
        if (
          p.parentId &&
          idsToDelete.has(p.parentId) &&
          !idsToDelete.has(p.id)
        ) {
          idsToDelete.add(p.id)
          changed = true
        }
      }
    }

    // 締め済み月に値（計画>0または実績の明示キー）を持つアサインが対象ツリーに存在する
    // 場合は削除を拒否する（カスケードが締め済みの事実を道連れに消すため。P1-b段階2＝
    // 既知の制限の解消。サーバー側projects.tsのbeforeDeleteと二重防御）
    const actualsState = useActualsStore.getState()
    const closedMonths = [
      ...new Set(actualsState.monthlyCloseEvents.map((e) => e.month)),
    ].filter((month) => actualsState.isMonthClosed(month))
    if (closedMonths.length > 0) {
      const { assignments } = useAssignmentStore.getState()
      for (const entry of assignments) {
        if (
          !idsToDelete.has(entry.projectId) &&
          !idsToDelete.has(entry.taskId)
        ) {
          continue
        }
        for (const month of closedMonths) {
          if (
            (entry.monthlyValues[month] ?? 0) > 0 ||
            entry.actualMonthlyValues?.[month] !== undefined
          ) {
            toast({
              title: `締め済み月（${month}）の実績を含むため削除できません`,
              description:
                '先に月次実績画面で該当月の締めを解除してから削除してください',
              variant: 'destructive',
            })
            return
          }
        }
      }
    }

    set({ projects: previous.filter((p) => !idsToDelete.has(p.id)) })
    Promise.all(
      [...idsToDelete].map((targetId) =>
        getDataAdapter()
          .remove('projects', targetId)
          .catch((error: unknown) => {
            // postgresモードではprojects.parentIdが自己参照FK（ON DELETE CASCADE）のため、
            // 親の削除が先に処理されると子孫の個別remove()が404になりうる（並行実行の
            // Promise.allでは処理順序が保証されない。実Postgresで反証・確認済み）。
            // 対象が既に存在しないことは「削除する」という目的を既に満たしているため、
            // 404はエラー扱いしない。それ以外のエラーは通常通り再送出しロールバックさせる
            if (error instanceof ApiError && error.status === 404) return
            throw error
          }),
      ),
    ).catch((error: unknown) => {
      set({ projects: previous })
      notifyPersistenceFailure('削除', error)
    })
  },

  getProjectById: (id) => {
    return get().projects.find((p) => p.id === id)
  },

  getProjectsByLevel: (level) => {
    return get().projects.filter((p) => p.level === level)
  },

  getProjectsByParentId: (parentId) => {
    return get().projects.filter((p) => p.parentId === parentId)
  },

  getProjectTree: () => {
    return buildProjectTree(get().projects)
  },
}))
