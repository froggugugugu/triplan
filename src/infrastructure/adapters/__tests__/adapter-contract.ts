import { beforeEach, describe, expect, it } from 'vitest'
import type { DataAdapter } from '../data-adapter'

/**
 * DataAdapterの実装（LocalJsonAdapter / 将来のPostgresApiAdapter）が共通で満たすべき
 * 契約テスト（非公開の設計文書）。
 * 'divisions'エンティティ（id/name/sortOrder/createdAt/updatedAtのみの単純なスキーマ）を
 * 対象に、実装非依存の振る舞いのみを検証する。
 */
export function runAdapterContractTests(
  label: string,
  makeAdapter: () => DataAdapter,
) {
  describe(`DataAdapter契約テスト: ${label}`, () => {
    let adapter: DataAdapter

    beforeEach(() => {
      adapter = makeAdapter()
    })

    it('新規作成したエンティティにidが採番される', async () => {
      const created = await adapter.create('divisions', {
        name: '開発部',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      expect(created.id).toBeTruthy()
      expect(created.name).toBe('開発部')
    })

    it('create()にoptions.idを指定すると、そのidで作成される', async () => {
      const clientId = crypto.randomUUID()
      const created = await adapter.create(
        'divisions',
        {
          name: 'クライアント指定id部',
          sortOrder: 99,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { id: clientId },
      )

      expect(created.id).toBe(clientId)
      const list = await adapter.list('divisions')
      expect(list.some((d) => d.id === clientId)).toBe(true)
    })

    it('作成したエンティティがlistで取得できる', async () => {
      await adapter.create('divisions', {
        name: '営業部',
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const list = await adapter.list('divisions')
      expect(list.some((d) => d.name === '営業部')).toBe(true)
    })

    it('updateで部分更新できる（他フィールドは維持される）', async () => {
      const created = await adapter.create('divisions', {
        name: '更新前',
        sortOrder: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const updated = await adapter.update('divisions', created.id, {
        name: '更新後',
      })

      expect(updated.id).toBe(created.id)
      expect(updated.name).toBe('更新後')
      expect(updated.sortOrder).toBe(2)
    })

    it('存在しないidをupdateするとエラーになる', async () => {
      await expect(
        adapter.update('divisions', 'not-a-real-id', { name: 'x' }),
      ).rejects.toThrow()
    })

    it('removeで削除したエンティティはlistから消える', async () => {
      const created = await adapter.create('divisions', {
        name: '削除対象',
        sortOrder: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await adapter.remove('divisions', created.id)

      const list = await adapter.list('divisions')
      expect(list.some((d) => d.id === created.id)).toBe(false)
    })

    it('存在しないidをremoveしても例外にならない（冪等）', async () => {
      await expect(
        adapter.remove('divisions', 'not-a-real-id'),
      ).resolves.not.toThrow()
    })

    it('bulkUpdateで複数エンティティを一括更新できる', async () => {
      const a = await adapter.create('divisions', {
        name: 'A',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      const b = await adapter.create('divisions', {
        name: 'B',
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const result = await adapter.bulkUpdate('divisions', [
        { id: a.id, patch: { sortOrder: 10 } },
        { id: b.id, patch: { sortOrder: 20 } },
      ])

      expect(result.find((d) => d.id === a.id)?.sortOrder).toBe(10)
      expect(result.find((d) => d.id === b.id)?.sortOrder).toBe(20)
    })

    it('appSettings: updateAppSettingsで更新した値がloadAppSettingsで往復できる（P0-b）', async () => {
      await adapter.updateAppSettings({
        estimatedUnitPrice: 120,
        workdaysPerMonth: 18,
      })
      const settings = await adapter.loadAppSettings()
      expect(settings.estimatedUnitPrice).toBe(120)
      expect(settings.workdaysPerMonth).toBe(18)
    })

    // 反証: 部分更新の契約。全体上書きにすると「未ロードのまま保存すると他フィールドが
    // 既定値で消える」既知の事故パターン（docs/development-patterns.md §10）を再現するため
    it('反証: updateAppSettingsは指定キーのみ更新し、未指定キーを変更しない', async () => {
      await adapter.updateAppSettings({
        estimatedUnitPrice: 100,
        skillReviewCycleMonths: 6,
      })
      await adapter.updateAppSettings({ estimatedUnitPrice: 150 })

      const settings = await adapter.loadAppSettings()
      expect(settings.estimatedUnitPrice).toBe(150)
      expect(settings.skillReviewCycleMonths).toBe(6)
    })

    it('appSettings: 未設定のフィールドはundefined（キー欠落）で返る', async () => {
      const settings = await adapter.loadAppSettings()
      expect(settings.baselineStaleThreshold).toBeUndefined()
    })

    // 回帰テスト: hoursPerDayはLocalJsonAdapterのloadAppSettings返却リストに
    // 導入時（P1-a）から漏れており、localモードで時間換算の設定がリロード後に既定値8へ
    // 戻る実バグだった（保存自体は汎用ループで成功しており、読み出しだけが欠落）。
    // サマリー判定閾値2件（新設）も同じ往復契約で検証する
    it('appSettings: hoursPerDayとサマリー判定閾値がloadAppSettingsで往復できる', async () => {
      await adapter.updateAppSettings({
        hoursPerDay: 7.5,
        summaryBudgetProgressGapThreshold: 0.2,
        summarySpiWarningThreshold: 0.85,
      })
      const settings = await adapter.loadAppSettings()
      expect(settings.hoursPerDay).toBe(7.5)
      expect(settings.summaryBudgetProgressGapThreshold).toBe(0.2)
      expect(settings.summarySpiWarningThreshold).toBe(0.85)
    })

    // : hoursPerFunctionPoint（人時/FP）も同じ往復契約で固定する
    // （loadAppSettingsの返却列挙に漏れると保存は成功して読み出しだけ欠ける）
    it('appSettings: hoursPerFunctionPointがloadAppSettingsで往復できる', async () => {
      await adapter.updateAppSettings({ hoursPerFunctionPoint: 12.5 })
      const settings = await adapter.loadAppSettings()
      expect(settings.hoursPerFunctionPoint).toBe(12.5)
    })

    it('capabilities.modeが実装ごとに正しく設定されている', () => {
      expect(['local', 'postgres']).toContain(adapter.capabilities.mode)
    })
  })
}
