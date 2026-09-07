import { MultiSelectCombobox } from '@/shared/components/ui/multi-select-combobox'
import type { Company } from '@/shared/types/company'
import type { InternalFilterMode } from '@/shared/utils/member-filter'

export interface TeamMemberFilterBarProps {
  companies: Company[]
  selectedCompanyIds: string[]
  onCompanyIdsChange: (companyIds: string[]) => void
  internalFilter: InternalFilterMode
  onInternalFilterChange: (mode: InternalFilterMode) => void
}

export function TeamMemberFilterBar({
  companies,
  selectedCompanyIds,
  onCompanyIdsChange,
  internalFilter,
  onInternalFilterChange,
}: TeamMemberFilterBarProps) {
  const sortedCompanies = [...companies].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  const companyOptions = sortedCompanies.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-56">
        <MultiSelectCombobox
          values={selectedCompanyIds}
          onValuesChange={onCompanyIdsChange}
          options={companyOptions}
          placeholder="所属会社で絞り込み"
          emptyMessage="所属会社が登録されていません"
          ariaLabel="所属会社で絞り込み"
        />
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">区分:</span>
        <select
          aria-label="内部/外部リソース"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          value={internalFilter}
          onChange={(e) =>
            onInternalFilterChange(e.target.value as InternalFilterMode)
          }
        >
          <option value="all">全て</option>
          <option value="internal">内部リソースのみ</option>
          <option value="external">外部リソースのみ</option>
        </select>
      </div>
    </div>
  )
}
