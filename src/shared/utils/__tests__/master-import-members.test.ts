import { describe, expect, it } from 'vitest'
import type { Company } from '@/shared/types/company'
import type { Division } from '@/shared/types/division'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import { parseCsv } from '../csv-utils'
import {
  buildMemberImportPlan,
  type MemberImportContext,
} from '../master-import-members'

/**
 * チームメンバーCSV一括登録。
 * 移行は**新規登録が主**なので、既存と一致した行を取り込まないこと（上書き事故の防止）と、
 * 誤った帰属を作らないこと（同名の判別不能はskip）を重点的に固定する。
 */

const NOW = '2026-04-01T00:00:00.000Z'

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: '既存太郎',
    email: null,
    sectionId: null,
    role: '',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
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
const SECTION: Section = {
  id: '00000000-0000-4000-8000-0000000000c1',
  divisionId: DIV.id,
  name: '第1課',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
}
const COMPANY: Company = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: '株式会社ABC',
  sortOrder: 0,
  isInternal: false,
  createdAt: NOW,
  updatedAt: NOW,
}

function ctx(
  overrides: Partial<MemberImportContext> = {},
): MemberImportContext {
  return {
    members: [],
    divisions: [DIV],
    sections: [SECTION],
    companies: [COMPANY],
    autoCreateMasters: true,
    fallbackEffectiveFrom: '2026-04',
    ...overrides,
  }
}

function plan(csv: string, overrides: Partial<MemberImportContext> = {}) {
  return buildMemberImportPlan(parseCsv(csv), ctx(overrides))
}

describe('buildMemberImportPlan', () => {
  it('基本の行を取り込む', () => {
    const result = plan(
      [
        '氏名,メール,部門,課,所属会社,役割,契約形態,稼働率上限,開始日,終了日,単価,契約単価',
        '山田太郎,yamada@example.com,開発部,第1課,株式会社ABC,PL,準委任,0.5,2026-04-01,2027-03-31,100,80',
      ].join('\n'),
    )

    expect(result.skips).toEqual([])
    expect(result.candidates).toHaveLength(1)
    const [c] = result.candidates
    expect(c).toMatchObject({
      row: 2,
      name: '山田太郎',
      email: 'yamada@example.com',
      sectionId: SECTION.id,
      companyId: COMPANY.id,
      role: 'PL',
      contractType: '準委任',
      capacityRatio: 0.5,
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      unitPrice: 100,
      contractUnitPrice: 80,
    })
    // 単価適用開始が空欄なら開始日の月から適用する
    expect(c?.effectiveFrom).toBe('2026-04')
  })

  it('必須列（氏名）だけでも取り込める', () => {
    const result = plan(['氏名', '山田太郎'].join('\n'))
    expect(result.skips).toEqual([])
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      name: '山田太郎',
      email: null,
      sectionId: null,
      companyId: null,
      // 開始日も単価適用開始も無いときは既定へ落ちる
      effectiveFrom: '2026-04',
    })
  })

  it('テンプレートの*付きヘッダをそのまま受ける', () => {
    const result = plan(['氏名*,メール', '山田太郎,y@example.com'].join('\n'))
    expect(result.candidates).toHaveLength(1)
  })

  it('列の並びが違っても列名で解決する', () => {
    const result = plan(
      ['メール,役割,氏名', 'y@example.com,PG,山田'].join('\n'),
    )
    expect(result.candidates[0]).toMatchObject({ name: '山田', role: 'PG' })
  })

  describe('既存との突合（移行は新規登録が主）', () => {
    it('反証: メールが既存と一致する行は取り込まない（現行データを上書きしない）', () => {
      const result = plan(
        ['氏名,メール', '別名,YAMADA@example.com'].join('\n'),
        { members: [member({ email: 'yamada@example.com' })] },
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('既に登録済み')
    })

    it('反証: メールが無く同名が既にいる行は取り込まない（別人か同一人か判別できない）', () => {
      const result = plan(['氏名', '既存太郎'].join('\n'), {
        members: [member({ name: '既存太郎' })],
      })
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(
        '同じ氏名が既に登録されています',
      )
    })

    it('メールが違えば同名でも取り込める（同姓同名を登録できる）', () => {
      const result = plan(
        ['氏名,メール', '既存太郎,new@example.com'].join('\n'),
        { members: [member({ name: '既存太郎', email: 'old@example.com' })] },
      )
      expect(result.candidates).toHaveLength(1)
    })

    it('反証: CSV内で重複した行は2件目を取り込まない（同じ人を2回作らない）', () => {
      const result = plan(
        [
          '氏名,メール',
          '山田,y@example.com',
          '山田（別表記）,Y@example.com',
        ].join('\n'),
      )
      expect(result.candidates).toHaveLength(1)
      expect(result.skips[0]?.reason).toContain('CSV内でメールが重複')
    })
  })

  describe('マスタの自動作成', () => {
    it('未登録の部門・課・会社を作成対象として返す', () => {
      const result = plan(
        [
          '氏名,部門,課,所属会社',
          '山田,新規部,新規課,新規会社',
          '佐藤,新規部,新規課,新規会社',
        ].join('\n'),
      )
      expect(result.skips).toEqual([])
      // 重複はまとめる（2行あっても作成は1つずつ）
      expect(result.newDivisions).toEqual(['新規部'])
      expect(result.newSections).toEqual([
        { divisionName: '新規部', name: '新規課' },
      ])
      expect(result.newCompanies).toEqual(['新規会社'])
      // 作成待ちの課はまだidが決まらない
      expect(result.candidates[0]?.sectionId).toBeNull()
    })

    it('反証: 自動作成しない設定なら、未登録マスタの行はskipする', () => {
      const result = plan(['氏名,部門', '山田,新規部'].join('\n'), {
        autoCreateMasters: false,
      })
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(
        '部門「新規部」が登録されていません',
      )
      expect(result.newDivisions).toEqual([])
    })

    it('反証: 同名の課でも部門が違えば別の課として扱う', () => {
      const result = plan(['氏名,部門,課', '山田,別部門,第1課'].join('\n'))
      expect(result.newSections).toEqual([
        { divisionName: '別部門', name: '第1課' },
      ])
      // 既存の「開発部 / 第1課」を掴まない
      expect(result.candidates[0]?.sectionId).toBeNull()
    })

    it('課だけ指定して部門が無い行はskip（どの部門の課か決まらない）', () => {
      const result = plan(['氏名,課', '山田,第1課'].join('\n'))
      expect(result.skips[0]?.reason).toContain('部門も指定してください')
    })
  })

  describe('値の検証', () => {
    it.each([
      ['メールの形式', '氏名,メール\n山田,not-an-email', 'メールの形式'],
      ['契約形態', '氏名,契約形態\n山田,業務委託', '契約形態は'],
      ['稼働率上限（0）', '氏名,稼働率上限\n山田,0', '稼働率上限'],
      ['稼働率上限（1超）', '氏名,稼働率上限\n山田,1.5', '稼働率上限'],
      ['開始日の暦', '氏名,開始日\n山田,2026-02-30', '実在する日付'],
      [
        '終了日が開始日より前',
        '氏名,開始日,終了日\n山田,2026-04-01,2026-03-31',
        '終了日が開始日より前',
      ],
      ['単価が負', '氏名,単価\n山田,-1', '0以上の数値'],
      ['単価適用開始の形式', '氏名,単価適用開始\n山田,2026/04', 'YYYY-MM形式'],
    ])('%s が不正な行はskipする', (_label, csv, expected) => {
      const result = plan(csv)
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(expected)
    })

    it('稼働率上限の境界（1.0ちょうど）は受け付ける', () => {
      const result = plan(['氏名,稼働率上限', '山田,1'].join('\n'))
      expect(result.candidates[0]?.capacityRatio).toBe(1)
    })

    it('反証: 契約単価は所属会社なしでは取り込まない（支払先が決まらない）', () => {
      const result = plan(['氏名,契約単価', '山田,80'].join('\n'))
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('所属会社も指定してください')
    })

    it('単価0は「0円」として取り込む（未入力と区別する）', () => {
      const result = plan(['氏名,単価', '山田,0'].join('\n'))
      expect(result.candidates[0]?.unitPrice).toBe(0)
    })
  })

  it('反証: 空行は行として数えずskipにもしない（末尾の改行で件数がずれない）', () => {
    const result = plan(['氏名', '山田', '', ''].join('\n'))
    expect(result.candidates).toHaveLength(1)
    expect(result.skips).toEqual([])
  })

  it('氏名列が無いCSVはヘッダの問題として1件だけ報告する', () => {
    const result = plan(['名前,メール', '山田,y@example.com'].join('\n'))
    expect(result.candidates).toEqual([])
    expect(result.skips).toEqual([
      { row: 1, reason: '「氏名」列が見つかりません' },
    ])
  })

  it('skipは行番号つきで返す（ヘッダが1行目、データは2行目から）', () => {
    const result = plan(['氏名', '山田', ''].join('\n'))
    expect(result.candidates[0]?.row).toBe(2)
  })
})
