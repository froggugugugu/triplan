import { describe, expect, it } from 'vitest'
import { searchEntities } from '../global-search'

/**
 * 横断検索。標準WBSテンプレートを適用すると1案件で50〜100タスクが
 * 生成される設計のため、数案件で目視スクロールが破綻する。その到達手段を提供する。
 */

const PROJECTS = [
  {
    id: 'p1',
    code: 'P100',
    name: '会員基盤リプレース',
    parentId: null,
    level: 0,
  },
  { id: 'p2', code: 'P100-01', name: '要件定義', parentId: 'p1', level: 1 },
  {
    id: 'p3',
    code: 'P100-01-01',
    name: '業務要件の整理',
    parentId: 'p2',
    level: 2,
  },
  {
    id: 'p4',
    code: 'P200',
    name: '在庫管理システム',
    parentId: null,
    level: 0,
  },
]

const MEMBERS = [
  { id: 'm1', name: '山田太郎', isActive: true },
  { id: 'm2', name: '佐藤花子', isActive: true },
  { id: 'm3', name: '退職者テスト', isActive: false },
]

describe('searchEntities', () => {
  describe('基本の検索', () => {
    it('プロジェクト名の部分一致で見つかる', () => {
      const results = searchEntities('会員', PROJECTS, MEMBERS)
      expect(results.map((r) => r.id)).toContain('p1')
    })

    it('タスクのコードで見つかる', () => {
      const results = searchEntities('P100-01-01', PROJECTS, MEMBERS)
      expect(results[0]).toMatchObject({ id: 'p3', kind: 'task' })
    })

    it('メンバー名で見つかる', () => {
      const results = searchEntities('山田', PROJECTS, MEMBERS)
      expect(results[0]).toMatchObject({ id: 'm1', kind: 'member' })
    })

    it('英字の大文字小文字を区別しない', () => {
      expect(searchEntities('p100', PROJECTS, MEMBERS).length).toBeGreaterThan(
        0,
      )
      expect(searchEntities('P100', PROJECTS, MEMBERS).length).toBeGreaterThan(
        0,
      )
    })

    it('level===0はproject、level>0はtaskとして分類する', () => {
      const results = searchEntities('P100', PROJECTS, MEMBERS)
      expect(results.find((r) => r.id === 'p1')?.kind).toBe('project')
      expect(results.find((r) => r.id === 'p2')?.kind).toBe('task')
    })
  })

  describe('反証: 意図しない結果を返さない', () => {
    it('空クエリでは何も返さない（全件を返して画面を埋めない）', () => {
      expect(searchEntities('', PROJECTS, MEMBERS)).toEqual([])
      expect(searchEntities('   ', PROJECTS, MEMBERS)).toEqual([])
    })

    it('どこにも一致しなければ空配列', () => {
      expect(searchEntities('存在しない文字列xyz', PROJECTS, MEMBERS)).toEqual(
        [],
      )
    })

    it('反証: 退職済み（isActive=false）のメンバーは検索対象外', () => {
      // 現在の体制を探すための検索であり、過去の在籍者を出すとノイズになる
      expect(searchEntities('退職者', PROJECTS, MEMBERS)).toEqual([])
    })

    it('反証: 結果は上限件数で打ち切る（無制限に返さない）', () => {
      const many = Array.from({ length: 100 }, (_, i) => ({
        id: `x${i}`,
        code: `P900-${String(i).padStart(2, '0')}`,
        name: `タスク${i}`,
        parentId: 'p1',
        level: 1 as const,
      }))
      const results = searchEntities('P900', many, [])
      expect(results.length).toBeLessThanOrEqual(20)
    })
  })

  describe('並び順（探しているものが上に来る）', () => {
    it('コードの完全一致を最優先する', () => {
      // 'P100'は P100（完全一致）と P100-01 / P100-01-01（前方一致）にマッチする
      const results = searchEntities('P100', PROJECTS, MEMBERS)
      expect(results[0]?.id).toBe('p1')
    })

    it('反証: 前方一致は部分一致より上に来る', () => {
      const projects = [
        {
          id: 'a',
          code: 'Z001',
          name: '設計レビュー',
          parentId: null,
          level: 0,
        },
        { id: 'b', code: 'Z002', name: 'レビュー会', parentId: null, level: 0 },
      ]
      const results = searchEntities('レビュー', projects, [])
      // 'レビュー会'（前方一致）が '設計レビュー'（部分一致）より上
      expect(results[0]?.id).toBe('b')
    })

    it('同じ強さならプロジェクト→タスク→メンバーの順で並ぶ', () => {
      const projects = [
        { id: 'a', code: 'C1', name: 'アルファ', parentId: null, level: 0 },
        { id: 'b', code: 'C2', name: 'アルファ', parentId: 'a', level: 1 },
      ]
      const members = [{ id: 'c', name: 'アルファ', isActive: true }]
      const results = searchEntities('アルファ', projects, members)
      expect(results.map((r) => r.kind)).toEqual(['project', 'task', 'member'])
    })
  })

  describe('遷移先の解決', () => {
    it('プロジェクトはプロジェクトサマリーへ、タスクはWBSへ（ルート案件を指定）', () => {
      const results = searchEntities('P100', PROJECTS, MEMBERS)
      expect(results.find((r) => r.id === 'p1')?.to).toBe(
        '/project-summary?projectId=p1',
      )
      // 孫タスクでもルート案件（p1）のWBSを開く
      expect(results.find((r) => r.id === 'p3')?.to).toBe('/wbs?projectId=p1')
    })

    it('メンバーはチーム画面へ', () => {
      expect(searchEntities('佐藤', PROJECTS, MEMBERS)[0]?.to).toBe('/team')
    })

    it('反証: 親が辿れない壊れたタスクはWBSのクエリを付けない（存在しないIDへ飛ばさない）', () => {
      const broken = [
        {
          id: 'x',
          code: 'X1',
          name: '孤児タスク',
          parentId: 'ghost',
          level: 1,
        },
      ]
      expect(searchEntities('孤児', broken, [])[0]?.to).toBe('/wbs')
    })
  })
})
