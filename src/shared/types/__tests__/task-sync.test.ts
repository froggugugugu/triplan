import { describe, expect, it } from 'vitest'
import { DatabaseSchema } from '@/shared/types/database'
import {
  CreateTaskSyncLogSchema,
  TaskSyncLogSchema,
} from '@/shared/types/task-sync'

const VALID_LOG = {
  id: crypto.randomUUID(),
  syncedAt: '2026-10-10T09:00:00.000Z',
  channel: 'csv',
  source: 'backlog',
  fileName: 'portal-issues.csv',
  completedCount: 3,
  reopenedCount: 1,
  unchangedCount: 5,
  skippedCount: 2,
  skippedReasons: [{ row: 4, reason: 'タスクを特定できません' }],
  note: null,
}

describe('TaskSyncLogSchema（完了同期ログ）', () => {
  it('正常な同期ログを受理する（fileName=nullのWebhook経路も可）', () => {
    expect(TaskSyncLogSchema.safeParse(VALID_LOG).success).toBe(true)
    expect(
      TaskSyncLogSchema.safeParse({
        ...VALID_LOG,
        channel: 'webhook',
        fileName: null,
      }).success,
    ).toBe(true)
  })

  it('反証: 負のカウント・101件のskippedReasonsは拒否する', () => {
    expect(
      TaskSyncLogSchema.safeParse({ ...VALID_LOG, completedCount: -1 }).success,
    ).toBe(false)
    expect(
      TaskSyncLogSchema.safeParse({
        ...VALID_LOG,
        skippedReasons: Array.from({ length: 101 }, (_, i) => ({
          row: i,
          reason: 'x',
        })),
      }).success,
    ).toBe(false)
  })

  it('反証: syncedAtの非datetime・空のchannel/sourceは拒否する', () => {
    expect(
      TaskSyncLogSchema.safeParse({ ...VALID_LOG, syncedAt: '2026-10-10' })
        .success,
    ).toBe(false)
    expect(
      TaskSyncLogSchema.safeParse({ ...VALID_LOG, channel: '' }).success,
    ).toBe(false)
    expect(
      TaskSyncLogSchema.safeParse({ ...VALID_LOG, source: '' }).success,
    ).toBe(false)
  })

  it('Createスキーマはidを除外する', () => {
    const { id: _id, ...rest } = VALID_LOG
    expect(CreateTaskSyncLogSchema.safeParse(rest).success).toBe(true)
  })

  it('DatabaseSchemaへの統合: taskSyncLogsを受理し、無くても後方互換', () => {
    const MINIMAL_DB = {
      version: '1.0.0',
      fiscalYear: 2026,
      projects: [],
      members: [],
      metadata: {
        lastModified: '2026-04-01T00:00:00.000Z',
        createdBy: 'test',
        version: '1.0.0',
      },
    }
    expect(DatabaseSchema.safeParse(MINIMAL_DB).success).toBe(true)
    expect(
      DatabaseSchema.safeParse({ ...MINIMAL_DB, taskSyncLogs: [VALID_LOG] })
        .success,
    ).toBe(true)
  })

  it('Projectの外部参照フィールド（externalSource/externalTaskId）を受理する', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト',
      parentId: null,
      level: 0,
      status: 'active',
      confidence: null,
      externalSource: 'backlog',
      externalTaskId: 'PORTAL-101',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    }
    const MINIMAL_DB = {
      version: '1.0.0',
      fiscalYear: 2026,
      projects: [project],
      members: [],
      metadata: {
        lastModified: '2026-04-01T00:00:00.000Z',
        createdBy: 'test',
        version: '1.0.0',
      },
    }
    expect(DatabaseSchema.safeParse(MINIMAL_DB).success).toBe(true)
    // 反証: フィールドが無い既存データも後方互換で通る
    const { externalSource: _s, externalTaskId: _t, ...legacyProject } = project
    expect(
      DatabaseSchema.safeParse({ ...MINIMAL_DB, projects: [legacyProject] })
        .success,
    ).toBe(true)
  })
})
