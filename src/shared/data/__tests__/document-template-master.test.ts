import { describe, expect, it } from 'vitest'
import type { WbsTemplateNode } from '@/shared/types/wbs-template'
import { CreateDocumentTemplateSchema } from '../../types/document-template'
import {
  createEmptyOkfContent,
  DOC_TEMPLATE_IDS,
  DOCUMENT_TEMPLATE_MASTER,
} from '../document-template-master'
import { STANDARD_WBS_TEMPLATE } from '../wbs-template-master'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function collectDocumentTemplateIds(nodes: WbsTemplateNode[]): string[] {
  return nodes.flatMap((n) => [
    ...(n.documentTemplateIds ?? []),
    ...collectDocumentTemplateIds(n.children ?? []),
  ])
}

describe('DOCUMENT_TEMPLATE_MASTER（プリセットの整合性）', () => {
  it('全エントリがCreateDocumentTemplateSchemaを満たす', () => {
    for (const entry of DOCUMENT_TEMPLATE_MASTER) {
      const { id: _id, ...data } = entry
      const result = CreateDocumentTemplateSchema.safeParse(data)
      expect(result.success, `${entry.name}: ${JSON.stringify(result)}`).toBe(
        true,
      )
    }
  })

  // 反証: idに16進数以外の文字が混入するとDatabaseSchema.parse()が静かに失敗する
  // （docs/development-patterns.md「E2Eシードデータの静かな読み込み失敗」の予防）
  it('反証: 全エントリのidが16進数のみの正しいUUID形式である', () => {
    for (const entry of DOCUMENT_TEMPLATE_MASTER) {
      expect(entry.id, entry.name).toMatch(UUID_PATTERN)
    }
  })

  it('反証: idに重複がない（固定UUIDの採番ミス防止）', () => {
    const ids = DOCUMENT_TEMPLATE_MASTER.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DOC_TEMPLATE_IDSの全idがマスタに実在する', () => {
    const masterIds = new Set(DOCUMENT_TEMPLATE_MASTER.map((e) => e.id))
    for (const [key, id] of Object.entries(DOC_TEMPLATE_IDS)) {
      expect(masterIds.has(id), `DOC_TEMPLATE_IDS.${key}`).toBe(true)
    }
  })

  it('全エントリの本文がOKF準拠（YAML frontmatterで始まり、typeフィールドを持つ）', () => {
    for (const entry of DOCUMENT_TEMPLATE_MASTER) {
      expect(entry.content.startsWith('---\n'), entry.name).toBe(true)
      // frontmatter内（2つ目の---まで）にOKF唯一の必須フィールドtypeがある
      const frontmatterEnd = entry.content.indexOf('\n---', 4)
      expect(frontmatterEnd, entry.name).toBeGreaterThan(0)
      const frontmatter = entry.content.slice(4, frontmatterEnd)
      expect(frontmatter, entry.name).toMatch(/^type: /m)
      expect(frontmatter, entry.name).toMatch(/^title: /m)
      expect(frontmatter, entry.name).toMatch(/^status: /m)
      expect(frontmatter, entry.name).toMatch(/^sources:/m)
    }
  })

  // 反証: タイトルはfrontmatterのtitleが担うため、本文にh1（#）は存在しない
  it('反証: 本文（frontmatter以降）にh1見出しが存在せずh2から始まる', () => {
    for (const entry of DOCUMENT_TEMPLATE_MASTER) {
      const frontmatterEnd = entry.content.indexOf('\n---', 4)
      const body = entry.content.slice(frontmatterEnd + 4)
      expect(body, entry.name).not.toMatch(/^# /m)
      expect(body, entry.name).toMatch(/^## /m)
    }
  })

  it('全エントリがIPA出典（sourceRefs）を持つ', () => {
    for (const entry of DOCUMENT_TEMPLATE_MASTER) {
      expect(entry.sourceRefs, entry.name).toBeDefined()
      expect(entry.sourceRefs?.length, entry.name).toBeGreaterThan(0)
      expect(entry.sourceRefs?.join(''), entry.name).toContain('IPA')
    }
  })
})

describe('STANDARD_WBS_TEMPLATEとの紐づけ整合性', () => {
  it('WBSテンプレートの全documentTemplateIdsがマスタに実在する（参照切れなし）', () => {
    const masterIds = new Set(DOCUMENT_TEMPLATE_MASTER.map((e) => e.id))
    const referenced = collectDocumentTemplateIds(STANDARD_WBS_TEMPLATE)
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) {
      expect(masterIds.has(id), `参照切れ: ${id}`).toBe(true)
    }
  })

  it('要件定義・基本設計の各ドキュメントノードに紐づけがある（デフォルトで使える状態）', () => {
    const requirementPhase = STANDARD_WBS_TEMPLATE.find(
      (n) => n.name === '要件定義',
    )
    expect(requirementPhase).toBeDefined()
    for (const child of requirementPhase?.children ?? []) {
      expect(
        child.documentTemplateIds?.length,
        `${child.name}に紐づけなし`,
      ).toBeGreaterThan(0)
    }
    const basicDesignPhase = STANDARD_WBS_TEMPLATE.find(
      (n) => n.name === '基本設計',
    )
    for (const child of basicDesignPhase?.children ?? []) {
      expect(
        child.documentTemplateIds?.length,
        `${child.name}に紐づけなし`,
      ).toBeGreaterThan(0)
    }
  })

  it('運用設計工程が補完されている（IPA共通フレーム 運用プロセス）', () => {
    const operationPhase = STANDARD_WBS_TEMPLATE.find(
      (n) => n.name === '運用設計',
    )
    expect(operationPhase).toBeDefined()
    expect(operationPhase?.children?.[0]?.documentTemplateIds).toContain(
      DOC_TEMPLATE_IDS.operationDesign,
    )
  })
})

describe('createEmptyOkfContent', () => {
  it('OKF準拠の骨格（type必須フィールド・frontmatter・h2開始）を生成する', () => {
    const content = createEmptyOkfContent('新規ドキュメント')
    expect(content.startsWith('---\n')).toBe(true)
    expect(content).toMatch(/^type: document$/m)
    expect(content).toMatch(/^title: 新規ドキュメント$/m)
    const frontmatterEnd = content.indexOf('\n---', 4)
    const body = content.slice(frontmatterEnd + 4)
    expect(body).not.toMatch(/^# /m)
    expect(body).toMatch(/^## /m)
  })
})
