import { createAuthenticatedFetcher } from '@/infrastructure/adapters'
import type { TaskCreationResult } from '@/shared/utils/task-creation-core'
import { useAuthStore } from '@/stores'

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
}

/**
 * 外部ツール接続管理API（server/src/routes/external-tools.ts）＋API起票実行
 * （server/src/routes/task-creation.ts）向けクライアント（API起票基盤）。
 * notifications-api.tsと同じ整理で、DataAdapterの汎用CRUDには含めない
 * （接続はサーバー専用エンティティ＝localモードには存在しない）。
 *
 * **shared配下に置く理由**: 接続管理は`features/admin`、起票実行は`features/projects`
 * （WBS画面）から使うため。features間の直接依存は禁止のため共通の置き場が要る。
 *
 * APIトークンは書き込み専用: サーバーは「設定済みか」のbooleanしか返さないため、
 * レスポンス型にも平文・暗号文のフィールドは存在しない。
 */
function getFetcher() {
  return createAuthenticatedFetcher({
    baseUrl: apiBaseUrl(),
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      await useAuthStore.getState().restoreSession()
      return useAuthStore.getState().status === 'authenticated'
    },
  })
}

export type ExternalTool = 'backlog' | 'asana' | 'jira' | 'github'

export const EXTERNAL_TOOL_LABELS: Record<ExternalTool, string> = {
  backlog: 'Backlog',
  asana: 'Asana',
  jira: 'Jira',
  github: 'GitHub',
}

/** ツール別の起票先設定。サーバー側のdiscriminated unionと形を一致させる */
export type ExternalToolTargetConfig =
  | { projectId: number; issueTypeId: number; priorityId: number }
  | { projectGid: string }
  | { projectKey: string; issueTypeId: string }
  | { owner: string; repo: string }

export interface ExternalToolConnection {
  id: string
  tool: ExternalTool
  name: string
  baseUrl: string | null
  authEmail: string | null
  targetConfig: ExternalToolTargetConfig | null
  enabled: boolean
  apiTokenConfigured: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateExternalToolConnectionInput {
  tool: ExternalTool
  name: string
  baseUrl?: string | null
  authEmail?: string | null
  apiToken?: string | null
  targetConfig?: ExternalToolTargetConfig | null
  enabled?: boolean
}

/** undefined=変更なし／null=クリア／文字列=再設定（apiToken） */
export type UpdateExternalToolConnectionInput = Partial<
  Omit<CreateExternalToolConnectionInput, 'tool'>
>

export interface ExternalToolMetadata {
  projects: Array<{ id: string; name: string }>
  issueTypes?: Array<{ id: string; name: string }>
  priorities?: Array<{ id: string; name: string }>
}

export async function listExternalToolConnections(): Promise<
  ExternalToolConnection[]
> {
  const { connections } = await getFetcher().request<{
    connections: ExternalToolConnection[]
  }>('/api/externalToolConnections')
  return connections
}

export async function createExternalToolConnection(
  input: CreateExternalToolConnectionInput,
): Promise<ExternalToolConnection> {
  const { connection } = await getFetcher().request<{
    connection: ExternalToolConnection
  }>('/api/externalToolConnections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return connection
}

export async function updateExternalToolConnection(
  id: string,
  patch: UpdateExternalToolConnectionInput,
): Promise<ExternalToolConnection> {
  const { connection } = await getFetcher().request<{
    connection: ExternalToolConnection
  }>(`/api/externalToolConnections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return connection
}

export async function deleteExternalToolConnection(id: string): Promise<void> {
  await getFetcher().request<undefined>(`/api/externalToolConnections/${id}`, {
    method: 'DELETE',
  })
}

export async function testExternalToolConnection(
  id: string,
): Promise<{ ok: boolean; detail: string | null }> {
  return getFetcher().request<{ ok: boolean; detail: string | null }>(
    `/api/externalToolConnections/${id}/test`,
    { method: 'POST' },
  )
}

export async function fetchExternalToolMetadata(
  id: string,
): Promise<ExternalToolMetadata> {
  return getFetcher().request<ExternalToolMetadata>(
    `/api/externalToolConnections/${id}/metadata`,
  )
}

/**
 * WBSタスクのAPI起票を実行する（Phase 3）。対象の再検証・外部ID学習・ログ追記は
 * すべてサーバー側で完結するため、クライアントは結果を受け取って表示するだけ。
 */
export async function executeTaskCreation(input: {
  connectionId: string
  rootProjectId: string
  taskIds: string[]
}): Promise<TaskCreationResult> {
  return getFetcher().request<TaskCreationResult>('/api/taskCreation/execute', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
