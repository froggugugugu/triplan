import { z } from 'zod'

/**
 * 組織設計の試算（/org-design）の「案」。本番の課（Section）・担当者の所属（Member.sectionId）は
 * 一切書き換えず、作成時点の課構成を複製したスナップショットとして保持する。
 * 兼務・稼働率・コスト・希望の充足は保存せず、案と本番データから都度導出する（導出値は保存しない原則）。
 */
export const OrgDesignTeamSchema = z.object({
  /** 案内のチームID（複製元の課IDとは別に採番する） */
  id: z.guid(),
  /** 複製元の課。新設チームは null。現組織との比較の対応づけに使う */
  sourceSectionId: z.guid().nullable(),
  /** 所属する第1階層（Division）。案の中で第1階層は増減しない */
  divisionId: z.guid(),
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().min(0),
  /** 受け持ちプロダクト（ルート案件 level===0 のID） */
  productIds: z.array(z.guid()),
  /** チームが扱う技術（技術タグID） */
  techTagIds: z.array(z.guid()),
})
export type OrgDesignTeam = z.infer<typeof OrgDesignTeamSchema>

export const OrgDesignDraftSchema = z.object({
  id: z.guid(),
  name: z.string().trim().min(1).max(100),
  /** 指標の集計対象年度 */
  fiscalYear: z.number().int(),
  teams: z.array(OrgDesignTeamSchema),
  /** memberId → 案内のチームID（null=未配置）。キーのない担当者も「未配置」として扱う */
  placements: z.record(z.guid(), z.guid().nullable()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type OrgDesignDraft = z.infer<typeof OrgDesignDraftSchema>

export const CreateOrgDesignDraftSchema = OrgDesignDraftSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateOrgDesignDraft = z.infer<typeof CreateOrgDesignDraftSchema>

export const UpdateOrgDesignDraftSchema =
  OrgDesignDraftSchema.partial().required({
    id: true,
  })
export type UpdateOrgDesignDraft = z.infer<typeof UpdateOrgDesignDraftSchema>
