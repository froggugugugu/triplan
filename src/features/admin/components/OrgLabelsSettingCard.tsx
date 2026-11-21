import { useEffect, useId, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { OrgLabelSchema } from '@/shared/types/org-labels'
import { useBudgetStore } from '@/stores'

/**
 * 組織階層の呼称（第1階層=部門 / 第2階層=課 の表示名）の設定。
 * 1文字ずつ保存すると途中の文字列が全画面へ伝わるため、入力欄から離れたときに
 * 2つまとめて保存する。CSVの列名は互換性のため変わらないことを説明に明記する。
 */
export function OrgLabelsSettingCard() {
  const level1 = useBudgetStore((s) => s.orgLevel1Label)
  const level2 = useBudgetStore((s) => s.orgLevel2Label)
  const setOrgLabels = useBudgetStore((s) => s.setOrgLabels)

  const [draft1, setDraft1] = useState(level1)
  const [draft2, setDraft2] = useState(level2)
  const [error, setError] = useState<'level1' | 'level2' | null>(null)
  const errorId = useId()

  // 設定の読み込み完了（既定値→保存値）に追従する
  useEffect(() => setDraft1(level1), [level1])
  useEffect(() => setDraft2(level2), [level2])

  const commit = () => {
    if (!OrgLabelSchema.safeParse(draft1).success) {
      setError('level1')
      return
    }
    if (!OrgLabelSchema.safeParse(draft2).success) {
      setError('level2')
      return
    }
    setError(null)
    if (draft1.trim() === level1 && draft2.trim() === level2) return
    setOrgLabels({ level1: draft1, level2: draft2 })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">組織の呼称</CardTitle>
        <CardDescription>
          画面に出す組織階層の名前（例: 本部・チーム）。CSVの列名は変わりません
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(
          [
            ['orgLevel1Label', '第1階層の呼称', draft1, setDraft1, 'level1'],
            ['orgLevel2Label', '第2階層の呼称', draft2, setDraft2, 'level2'],
          ] as const
        ).map(([id, label, value, setValue, key]) => (
          <div
            key={id}
            className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
          >
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              className="w-40"
              value={value}
              maxLength={20}
              aria-invalid={error === key}
              aria-describedby={error === key ? errorId : undefined}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
            />
          </div>
        ))}
        {error && (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            呼称は1〜20文字で入力してください
          </p>
        )}
      </CardContent>
    </Card>
  )
}
