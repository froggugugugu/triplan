import { STANDARD_WBS_TEMPLATE } from '@/shared/data/wbs-template-master'
import type { WbsTemplateNode } from '@/shared/types/wbs-template'

/**
 * applyWbsTemplateの実体は`shared/utils/wbs-template-apply.ts`へ移設（* 初期設定ウィザードからも使うためshared化）。features配下からの参照用にリエクスポートする。
 */
export { applyWbsTemplate } from '@/shared/utils/wbs-template-apply'
export type { WbsTemplateNode }
export { STANDARD_WBS_TEMPLATE }
