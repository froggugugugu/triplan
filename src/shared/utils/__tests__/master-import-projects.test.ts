import { describe, expect, it } from 'vitest'
import type { Division } from '@/shared/types/division'
import type { Project } from '@/shared/types/project'
import { parseCsv } from '../csv-utils'
import {
  buildProjectImportPlan,
  type ProjectImportContext,
} from '../master-import-projects'

/**
 * プロジェクト・タスクCSV一括登録。
 * 階層は「親コード」で表す。**行順に依存しない**ことと、
 * 突合キーであるコードで新たな重複を作らないことを重点的に固定する。
 */

const NOW = '2026-04-01T00:00:00.000Z'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'P001',
    name: '既存案件',
    parentId: null,
    level: 0,
    status: 'not_started',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const DIV: Division = {
  id: '00000000-0000-4000-8000-0000000000d1',
  name: '開発部',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
}

function ctx(
  overrides: Partial<ProjectImportContext> = {},
): ProjectImportContext {
  return {
    projects: [],
    divisions: [DIV],
    autoCreateMasters: true,
    ...overrides,
  }
}

function plan(csv: string, overrides: Partial<ProjectImportContext> = {}) {
  return buildProjectImportPlan(parseCsv(csv), ctx(overrides))
}

describe('buildProjectImportPlan', () => {
  it('最上位の属性を含めて取り込む', () => {
    const result = plan(
      [
        'コード,名前,説明,完了条件,ステータス,確度,担当部門,発注元,受注金額,優先度,契約形態,マスター納期',
        'P100,新規案件,説明文,完了条件文,進行中,A,開発部,株式会社XYZ,3000,高,請負,2027-03-31',
      ].join('\n'),
    )

    expect(result.skips).toEqual([])
    expect(result.candidates[0]).toMatchObject({
      code: 'P100',
      name: '新規案件',
      level: 0,
      parentId: null,
      status: 'active',
      confidence: 'A',
      divisionId: DIV.id,
      clientName: '株式会社XYZ',
      contractAmount: 3000,
      priority: 'high',
      contractType: '請負',
      masterDueDate: '2027-03-31',
    })
  })

  describe('階層の解決', () => {
    it('親コードからlevelを決める', () => {
      const result = plan(
        [
          'コード,名前,親コード',
          'P100,案件,',
          'P100-01,工程,P100',
          'P100-01-01,タスク,P100-01',
        ].join('\n'),
      )
      expect(result.skips).toEqual([])
      expect(result.candidates.map((c) => [c.code, c.level])).toEqual([
        ['P100', 0],
        ['P100-01', 1],
        ['P100-01-01', 2],
      ])
    })

    it('反証: 子が先に書かれていても解決し、親→子の順に並べ替えて返す', () => {
      const result = plan(
        [
          'コード,名前,親コード',
          'P100-01-01,タスク,P100-01',
          'P100-01,工程,P100',
          'P100,案件,',
        ].join('\n'),
      )
      expect(result.skips).toEqual([])
      // この順に作れば親が必ず先に存在する
      expect(result.candidates.map((c) => c.code)).toEqual([
        'P100',
        'P100-01',
        'P100-01-01',
      ])
    })

    it('既存プロジェクトを親にできる（追加のタスクだけを流し込める）', () => {
      const existing = project({ code: 'P001', level: 0 })
      const result = plan(
        ['コード,名前,親コード', 'P001-01,追加工程,P001'].join('\n'),
        { projects: [existing] },
      )
      expect(result.candidates[0]).toMatchObject({
        level: 1,
        parentId: existing.id,
      })
    })

    it('反証: 親が存在しない行はskip（勝手に最上位へぶら下げない）', () => {
      const result = plan(
        ['コード,名前,親コード', 'P100-01,工程,P999'].join('\n'),
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(
        '親コード「P999」が見つかりません',
      )
    })

    it('反証: 親子が循環している行はskip（無限ループしない）', () => {
      const result = plan(
        ['コード,名前,親コード', 'A,あ,B', 'B,い,A'].join('\n'),
      )
      expect(result.candidates).toEqual([])
      expect(result.skips).toHaveLength(2)
      for (const s of result.skips) {
        expect(s.reason).toContain('循環')
      }
    })

    it('反証: 階層が5を超える行はskip（スキーマ上限）', () => {
      const rows = ['コード,名前,親コード', 'L0,ル,']
      for (let i = 1; i <= 6; i++) rows.push(`L${i},層${i},L${i - 1}`)
      const result = plan(rows.join('\n'))

      expect(result.candidates.map((c) => c.code)).toEqual([
        'L0',
        'L1',
        'L2',
        'L3',
        'L4',
        'L5',
      ])
      expect(result.skips[0]?.reason).toContain('階層が深すぎます')
    })
  })

  describe('コードの一意性（外部連携の突合キー）', () => {
    it('反証: 既存と同じコードの行は取り込まない', () => {
      const result = plan(['コード,名前', 'P001,別名'].join('\n'), {
        projects: [project({ code: 'P001' })],
      })
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('既に登録済みのコード')
    })

    it('反証: CSV内で重複したコードは両方skip（どちらが正しいか決められない）', () => {
      const result = plan(
        ['コード,名前', 'P100,あ', 'P100,い', 'P200,う'].join('\n'),
      )
      expect(result.candidates.map((c) => c.code)).toEqual(['P200'])
      expect(result.skips).toHaveLength(2)
    })
  })

  describe('最上位だけが持つ属性', () => {
    it('反証: タスク行（level>0）に書かれた受注金額・担当部門は取り込まない', () => {
      const result = plan(
        [
          'コード,名前,親コード,受注金額,担当部門,優先度,発注元',
          'P100,案件,,3000,開発部,高,元請A',
          'P100-01,工程,P100,999,開発部,低,元請B',
        ].join('\n'),
      )
      const task = result.candidates.find((c) => c.code === 'P100-01')
      expect(task).toMatchObject({
        contractAmount: null,
        divisionId: null,
        divisionName: null,
        priority: null,
        clientName: null,
      })
    })
  })

  describe('値の検証', () => {
    it.each([
      ['ステータス', 'コード,名前,ステータス\nP1,あ,着手中', 'ステータスは'],
      ['確度', 'コード,名前,確度\nP1,あ,X', '確度は'],
      ['優先度', 'コード,名前,優先度\nP1,あ,最優先', '優先度は'],
      ['契約形態', 'コード,名前,契約形態\nP1,あ,委任', '契約形態は'],
      [
        'マスター納期の暦',
        'コード,名前,マスター納期\nP1,あ,2026-02-30',
        '実在する日付',
      ],
      ['受注金額が負', 'コード,名前,受注金額\nP1,あ,-1', '0以上の数値'],
    ])('%s が不正な行はskipする', (_label, csv, expected) => {
      const result = plan(csv)
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(expected)
    })

    it('ステータス未指定は未着手になる', () => {
      const result = plan(['コード,名前', 'P1,あ'].join('\n'))
      expect(result.candidates[0]?.status).toBe('not_started')
    })
  })

  it('未登録の担当部門を作成対象として返す', () => {
    const result = plan(['コード,名前,担当部門', 'P1,あ,新規部'].join('\n'))
    expect(result.newDivisions).toEqual(['新規部'])
    expect(result.candidates[0]?.divisionId).toBeNull()
  })

  it('反証: 自動作成しない設定なら未登録部門の行はskipする', () => {
    const result = plan(['コード,名前,担当部門', 'P1,あ,新規部'].join('\n'), {
      autoCreateMasters: false,
    })
    expect(result.candidates).toEqual([])
    expect(result.newDivisions).toEqual([])
  })

  it('必須列が無いCSVはヘッダの問題として報告する', () => {
    const result = plan(['名前', 'あ'].join('\n'))
    expect(result.skips).toEqual([
      { row: 1, reason: '「コード」列が見つかりません' },
    ])
  })

  it('反証: 空行は行として数えない', () => {
    const result = plan(['コード,名前', 'P1,あ', '', ''].join('\n'))
    expect(result.candidates).toHaveLength(1)
    expect(result.skips).toEqual([])
  })
})
