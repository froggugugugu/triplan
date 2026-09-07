import { beforeEach, describe, expect, it } from 'vitest'
import { LocalJsonAdapter } from '../local-json-adapter'
import { runAdapterContractTests } from './adapter-contract'

beforeEach(() => {
  localStorage.clear()
})

runAdapterContractTests('LocalJsonAdapter', () => new LocalJsonAdapter())

describe('LocalJsonAdapter固有の挙動', () => {
  it('既存のjsonStorage（resource-manager-dataキー）へ実際に永続化される', async () => {
    const adapter = new LocalJsonAdapter()
    await adapter.create('divisions', {
      name: '経営企画部',
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const raw = localStorage.getItem('resource-manager-data')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(
      parsed.divisions.some((d: { name: string }) => d.name === '経営企画部'),
    ).toBe(true)
  })

  it('capabilities.modeは常にlocal', () => {
    const adapter = new LocalJsonAdapter()
    expect(adapter.capabilities).toEqual({
      mode: 'local',
      supportsAuth: false,
      supportsServerSideCascade: false,
    })
  })

  it('loadDatabase/importDatabaseで丸ごとエクスポート・インポートできる', async () => {
    const adapter = new LocalJsonAdapter()
    await adapter.create('divisions', {
      name: '輸出対象',
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const exported = await adapter.loadDatabase()
    localStorage.clear()
    await adapter.importDatabase(exported)

    const list = await adapter.list('divisions')
    expect(list.some((d) => d.name === '輸出対象')).toBe(true)
  })

  it('より複雑なスキーマ（projects）でも作成・更新・削除が正しく動作する', async () => {
    const adapter = new LocalJsonAdapter()
    const created = await adapter.create('projects', {
      code: 'P999',
      name: 'テストプロジェクト',
      description: undefined,
      background: undefined,
      purpose: undefined,
      completionCriteria: undefined,
      parentId: null,
      level: 0,
      status: 'not_started',
      confidence: null,
      completed: false,
      divisionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    expect(created.code).toBe('P999')

    const updated = await adapter.update('projects', created.id, {
      status: 'active',
    })
    expect(updated.status).toBe('active')
    expect(updated.code).toBe('P999')

    await adapter.remove('projects', created.id)
    const list = await adapter.list('projects')
    expect(list.some((p) => p.id === created.id)).toBe(false)
  })
})
