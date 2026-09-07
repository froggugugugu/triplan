import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDataAdapter, resetDataAdapterForTesting } from '../adapter-factory'
import { LocalJsonAdapter } from '../local-json-adapter'
import { PostgresApiAdapter } from '../postgres-api-adapter'

beforeEach(() => {
  resetDataAdapterForTesting()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetDataAdapterForTesting()
})

describe('getDataAdapter', () => {
  it('VITE_STORAGE_MODE未設定時はLocalJsonAdapterを返す', () => {
    vi.stubEnv('VITE_STORAGE_MODE', '')
    const adapter = getDataAdapter()
    expect(adapter).toBeInstanceOf(LocalJsonAdapter)
    expect(adapter.capabilities.mode).toBe('local')
  })

  it('VITE_STORAGE_MODE=localではLocalJsonAdapterを返す', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')
    const adapter = getDataAdapter()
    expect(adapter).toBeInstanceOf(LocalJsonAdapter)
  })

  it('VITE_STORAGE_MODE=postgresでpostgresConfigを渡さないと例外を投げる', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    expect(() => getDataAdapter()).toThrow(/getAccessToken\/onUnauthorized/)
  })

  it('VITE_STORAGE_MODE=postgresでpostgresConfigを渡すとPostgresApiAdapterを返す', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'postgres')
    const adapter = getDataAdapter({
      getAccessToken: () => 'dummy-token',
      onUnauthorized: async () => false,
    })
    expect(adapter).toBeInstanceOf(PostgresApiAdapter)
    expect(adapter.capabilities.mode).toBe('postgres')
  })

  it('2回目の呼び出しはキャッシュされた同一インスタンスを返す（modeに関わらず引数を無視する）', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')
    const first = getDataAdapter()
    const second = getDataAdapter()
    expect(second).toBe(first)
  })

  it('resetDataAdapterForTestingでキャッシュをクリアできる', () => {
    vi.stubEnv('VITE_STORAGE_MODE', 'local')
    const first = getDataAdapter()
    resetDataAdapterForTesting()
    const second = getDataAdapter()
    expect(second).not.toBe(first)
    expect(second).toBeInstanceOf(LocalJsonAdapter)
  })
})
