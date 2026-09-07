import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { snapshotStorage } from '@/infrastructure/storage/snapshot-storage'
import type { Database } from '@/shared/types'

function createTestDatabase(fiscalYear = 2025): Database {
  return {
    version: '1.0.0',
    fiscalYear,
    projects: [],
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  }
}

const TEST_DIVISION_ID = '00000000-0000-0000-0000-000000000001'
const TEST_SECTION_ID = '00000000-0000-0000-0000-000000000002'

function createTestDatabaseWithTeam(fiscalYear = 2025): Database {
  return {
    ...createTestDatabase(fiscalYear),
    divisions: [
      {
        id: TEST_DIVISION_ID,
        name: '開発本部',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    sections: [
      {
        id: TEST_SECTION_ID,
        divisionId: TEST_DIVISION_ID,
        name: '第1課',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }
}

describe('snapshotStorage', () => {
  beforeEach(() => {
    snapshotStorage.clearAll()
  })

  afterEach(() => {
    snapshotStorage.clearAll()
  })

  describe('loadHistory', () => {
    it('空の履歴を読み込めること', () => {
      const history = snapshotStorage.loadHistory()
      expect(history.snapshots).toEqual([])
    })

    it('不正なデータの場合は空の履歴を返すこと', () => {
      localStorage.setItem('resource-manager-snapshots', 'invalid json data')
      const history = snapshotStorage.loadHistory()
      expect(history.snapshots).toEqual([])
    })
  })

  describe('saveSnapshot', () => {
    it('正常に保存・読み込みできること', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('release-1.0', db, '1.0.0')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.meta.tag).toBe('release-1.0')
        expect(result.meta.version).toBe('1.0.0')
        expect(result.meta.fiscalYear).toBe(2025)
      }

      const metaList = snapshotStorage.getMetaList()
      expect(metaList).toHaveLength(1)
      expect(metaList[0]?.tag).toBe('release-1.0')
    })

    it('タグが空文字の場合はエラーを返すこと', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('', db, '1.0.0')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeTruthy()
      }
    })

    it('タグに日本語が含まれる場合はエラーを返すこと', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('テスト', db, '1.0.0')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('半角英数字')
      }
    })

    it('タグにスペースが含まれる場合はエラーを返すこと', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('my tag', db, '1.0.0')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('半角英数字')
      }
    })

    it('タグに許可された記号（ドット、ハイフン、アンダースコア）が使えること', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot(
        'v1.0.0_release-candidate',
        db,
        '1.0.0',
      )

      expect(result.success).toBe(true)
    })

    it('タグ重複時にエラーを返すこと', () => {
      const db = createTestDatabase()
      snapshotStorage.saveSnapshot('release-1.0', db, '1.0.0')
      const result = snapshotStorage.saveSnapshot('release-1.0', db, '1.0.0')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('既に使用されています')
      }
    })

    it('上限20件を超えた場合に古いものが削除されること', () => {
      const db = createTestDatabase()

      // 21件保存
      for (let i = 1; i <= 21; i++) {
        const result = snapshotStorage.saveSnapshot(
          `tag-${String(i).padStart(3, '0')}`,
          db,
          '1.0.0',
        )
        expect(result.success).toBe(true)
      }

      const metaList = snapshotStorage.getMetaList()
      expect(metaList).toHaveLength(20)

      // 最初に保存したtag-001が削除されていること
      const tags = metaList.map((m) => m.tag)
      expect(tags).not.toContain('tag-001')
      // 最後に保存したtag-021が存在すること
      expect(tags).toContain('tag-021')
    })
  })

  describe('getSnapshotById', () => {
    it('IDでスナップショットを取得できること', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('test-tag', db, '1.0.0')

      if (result.success) {
        const entry = snapshotStorage.getSnapshotById(result.meta.id)
        expect(entry).toBeDefined()
        expect(entry?.meta.tag).toBe('test-tag')
        expect(entry?.data.fiscalYear).toBe(2025)
      }
    })

    it('存在しないIDの場合はundefinedを返すこと', () => {
      const entry = snapshotStorage.getSnapshotById('nonexistent-id')
      expect(entry).toBeUndefined()
    })
  })

  describe('deleteSnapshot', () => {
    it('スナップショットを削除できること', () => {
      const db = createTestDatabase()
      const result = snapshotStorage.saveSnapshot('to-delete', db, '1.0.0')

      if (result.success) {
        const deleted = snapshotStorage.deleteSnapshot(result.meta.id)
        expect(deleted).toBe(true)

        const metaList = snapshotStorage.getMetaList()
        expect(metaList).toHaveLength(0)
      }
    })

    it('存在しないIDの削除はfalseを返すこと', () => {
      const deleted = snapshotStorage.deleteSnapshot('nonexistent-id')
      expect(deleted).toBe(false)
    })
  })

  describe('clearAll', () => {
    it('全履歴をクリアできること', () => {
      const db = createTestDatabase()
      snapshotStorage.saveSnapshot('tag-1', db, '1.0.0')
      snapshotStorage.saveSnapshot('tag-2', db, '1.0.0')

      snapshotStorage.clearAll()

      const metaList = snapshotStorage.getMetaList()
      expect(metaList).toHaveLength(0)
    })
  })

  describe('saveSnapshot - team data', () => {
    it('divisions/sections付きデータを保存・復元できること', () => {
      const db = createTestDatabaseWithTeam()
      const result = snapshotStorage.saveSnapshot('team-snapshot', db, '1.0.0')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.meta.tag).toBe('team-snapshot')
        const entry = snapshotStorage.getSnapshotById(result.meta.id)
        expect(entry).toBeDefined()
        expect(entry?.data.divisions).toHaveLength(1)
        expect(entry?.data.sections).toHaveLength(1)
      }
    })

    it('スナップショットのデータサイズにteamデータが反映されること', () => {
      const dbWithoutTeam = createTestDatabase()
      const dbWithTeam = createTestDatabaseWithTeam()

      const resultWithout = snapshotStorage.saveSnapshot(
        'without-team',
        dbWithoutTeam,
        '1.0.0',
      )
      const resultWith = snapshotStorage.saveSnapshot(
        'with-team',
        dbWithTeam,
        '1.0.0',
      )

      expect(resultWithout.success).toBe(true)
      expect(resultWith.success).toBe(true)
      if (resultWithout.success && resultWith.success) {
        expect(resultWith.meta.dataSize).toBeGreaterThan(
          resultWithout.meta.dataSize,
        )
      }
    })

    it('復元データにdivisions/sectionsが含まれること', () => {
      const db = createTestDatabaseWithTeam()
      const result = snapshotStorage.saveSnapshot('team-restore', db, '1.0.0')

      expect(result.success).toBe(true)
      if (result.success) {
        const entry = snapshotStorage.getSnapshotById(result.meta.id)
        expect(entry).toBeDefined()
        expect(entry?.data.divisions).toEqual([
          expect.objectContaining({
            id: TEST_DIVISION_ID,
            name: '開発本部',
            sortOrder: 0,
          }),
        ])
        expect(entry?.data.sections).toEqual([
          expect.objectContaining({
            id: TEST_SECTION_ID,
            divisionId: TEST_DIVISION_ID,
            name: '第1課',
            sortOrder: 0,
          }),
        ])
      }
    })
  })
})
