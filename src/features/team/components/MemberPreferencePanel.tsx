import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { MultiSelectCombobox } from '@/shared/components/ui/multi-select-combobox'
import { useToast } from '@/shared/hooks/use-toast'
import type { Member } from '@/shared/types'
import { DateOnlySchema } from '@/shared/types/date-only'
import { MEMBER_PREFERENCE_MAX_ITEMS } from '@/shared/types/member-preference'
import {
  useMemberPreferenceStore,
  useProjectsStore,
  useTechTagsStore,
} from '@/stores'

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 了解日の検証。空・実在しない日付・未来日はエラー文言を返す（問題なければ null） */
function validateConsentedAt(value: string): string | null {
  if (!value) return '本人の了解を得た日を入力してください'
  if (!DateOnlySchema.safeParse(value).success) return '日付が正しくありません'
  // YYYY-MM-DD は文字列比較で日付順になる
  if (value > todayKey())
    return '未来の日付は入力できません（了解を得た日を入れてください）'
  return null
}

interface MemberPreferencePanelProps {
  member: Member
  /** data:write がない（閲覧のみ） */
  readOnly: boolean
}

/**
 * 担当者の希望（1on1 で本人の了解を得たものだけ）。組織設計の試算で「希望の充足」に使う。
 * 自由記述欄は置かない（会話内容を記録しない。スキーマでも未知キーを拒否している）。
 * 表示側（呼び出し元）で people:sensitive-read を確認してから描画すること。
 */
export function MemberPreferencePanel({
  member,
  readOnly,
}: MemberPreferencePanelProps) {
  const { toast } = useToast()
  const preferences = useMemberPreferenceStore((s) => s.preferences)
  const loadPreferences = useMemberPreferenceStore(
    (s) => s.loadMemberPreferences,
  )
  const savePreference = useMemberPreferenceStore((s) => s.savePreference)
  const deletePreference = useMemberPreferenceStore((s) => s.deletePreference)
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const techTags = useTechTagsStore((s) => s.techTags)
  const loadTechTags = useTechTagsStore((s) => s.loadTechTags)

  useEffect(() => {
    loadPreferences()
    loadProjects()
    loadTechTags()
  }, [loadPreferences, loadProjects, loadTechTags])

  const saved = preferences.find((p) => p.memberId === member.id)

  const [productIds, setProductIds] = useState<string[]>([])
  const [techTagIds, setTechTagIds] = useState<string[]>([])
  const [consentedAt, setConsentedAt] = useState('')
  const [limitError, setLimitError] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // 保存済みの値（読み込み完了・保存の確定）が変わったらフォームを合わせる
  const savedKey = saved ? `${saved.id}:${saved.updatedAt}` : 'none'
  // biome-ignore lint/correctness/useExhaustiveDependencies: savedKey の変化だけを契機にフォームを同期する
  useEffect(() => {
    setProductIds(saved?.desiredProductIds ?? [])
    setTechTagIds(saved?.desiredTechTagIds ?? [])
    setConsentedAt(saved?.consentedAt ?? '')
    setLimitError(false)
    setConfirmingDelete(false)
  }, [savedKey])

  const productOptions = useMemo(
    () =>
      projects
        .filter((p) => !p.parentId)
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )
  const techTagOptions = useMemo(
    () => techTags.map((t) => ({ value: t.id, label: t.name })),
    [techTags],
  )
  const labelOf = (options: { value: string; label: string }[], id: string) =>
    options.find((o) => o.value === id)?.label ?? '（削除済み）'

  const limited = (setter: (v: string[]) => void) => (next: string[]) => {
    if (next.length > MEMBER_PREFERENCE_MAX_ITEMS) {
      setLimitError(true)
      return
    }
    setLimitError(false)
    setter(next)
  }

  const consentError = consentedAt ? validateConsentedAt(consentedAt) : null
  const hasItems = productIds.length + techTagIds.length > 0
  const canSave = hasItems && validateConsentedAt(consentedAt) === null

  const handleSave = () => {
    if (!canSave) return
    const ok = savePreference({
      memberId: member.id,
      desiredProductIds: productIds,
      desiredTechTagIds: techTagIds,
      consentedAt,
    })
    if (ok) toast({ title: `${member.name}さんの希望を保存しました` })
  }

  if (readOnly) {
    if (!saved) {
      return (
        <p className="py-4 text-sm text-muted-foreground">
          希望は登録されていません。
        </p>
      )
    }
    return (
      <dl className="space-y-3 py-2 text-sm">
        <div>
          <dt className="text-muted-foreground">やりたいプロダクト</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {saved.desiredProductIds.map((id) => (
              <Badge key={id} variant="secondary">
                {labelOf(productOptions, id)}
              </Badge>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">伸ばしたいスキル</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {saved.desiredTechTagIds.map((id) => (
              <Badge key={id} variant="secondary">
                {labelOf(techTagOptions, id)}
              </Badge>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">本人の了解を得た日</dt>
          <dd className="mt-1 tabular-nums">{saved.consentedAt}</dd>
        </div>
      </dl>
    )
  }

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        1on1 で本人の了解を得た希望だけを登録します。会話の内容は記録しません。
        閲覧できるのは権限を持つ管理者と本人だけです。それぞれ最大
        {MEMBER_PREFERENCE_MAX_ITEMS}件まで。
      </p>
      <div className="space-y-2">
        <Label>やりたいプロダクト</Label>
        <MultiSelectCombobox
          values={productIds}
          onValuesChange={limited(setProductIds)}
          options={productOptions}
          placeholder="プロダクトを選択"
          ariaLabel="やりたいプロダクト"
        />
      </div>
      <div className="space-y-2">
        <Label>伸ばしたいスキル</Label>
        <MultiSelectCombobox
          values={techTagIds}
          onValuesChange={limited(setTechTagIds)}
          options={techTagOptions}
          placeholder="技術タグを選択"
          ariaLabel="伸ばしたいスキル"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="member-preference-consented-at">
          本人の了解を得た日
        </Label>
        <Input
          id="member-preference-consented-at"
          type="date"
          value={consentedAt}
          max={todayKey()}
          onChange={(e) => setConsentedAt(e.target.value)}
          aria-invalid={consentError ? true : undefined}
          aria-describedby={
            consentError ? 'member-preference-consent-error' : undefined
          }
          className="w-48"
        />
      </div>
      {(consentError || limitError) && (
        <p
          id="member-preference-consent-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {limitError
            ? `希望はそれぞれ最大${MEMBER_PREFERENCE_MAX_ITEMS}件までです`
            : consentError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={!canSave}>
          希望を保存
        </Button>
        {saved &&
          (confirmingDelete ? (
            <fieldset
              aria-label="取り下げの確認"
              className="flex items-center gap-2 text-sm"
            >
              <span>希望を削除します。元に戻せません。</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  deletePreference(member.id)
                  toast({ title: `${member.name}さんの希望を削除しました` })
                }}
              >
                削除する
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                キャンセル
              </Button>
            </fieldset>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(true)}
            >
              了解の取り下げ（希望を削除）
            </Button>
          ))}
      </div>
    </div>
  )
}
