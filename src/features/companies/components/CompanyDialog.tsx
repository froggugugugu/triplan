import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import type { Company, PaymentTerms } from '@/shared/types/company'
import type { CompanyExtras } from '@/stores/companies-store'

interface CompanyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company?: Company | null
  onSubmit: (name: string, isInternal: boolean, extras: CompanyExtras) => void
}

export function CompanyDialog({
  open,
  onOpenChange,
  company,
  onSubmit,
}: CompanyDialogProps) {
  const [name, setName] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [usePaymentTerms, setUsePaymentTerms] = useState(false)
  const [terms, setTerms] = useState<PaymentTerms>({
    closingDay: 31,
    paymentMonthOffset: 1,
    paymentDay: 31,
  })
  const [invoiceError, setInvoiceError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(company?.name ?? '')
      setIsInternal(company?.isInternal ?? false)
      setInvoiceNumber(company?.invoiceRegistrationNumber ?? '')
      setUsePaymentTerms(Boolean(company?.paymentTerms))
      setTerms(
        company?.paymentTerms ?? {
          closingDay: 31,
          paymentMonthOffset: 1,
          paymentDay: 31,
        },
      )
      setInvoiceError(null)
    }
  }, [open, company])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (trimmed.length === 0) return
      const trimmedInvoice = invoiceNumber.trim()
      if (trimmedInvoice && !/^T\d{13}$/.test(trimmedInvoice)) {
        setInvoiceError(
          '登録番号はT＋13桁の数字で入力してください（例: T1234567890123）',
        )
        return
      }
      onSubmit(trimmed, isInternal, {
        invoiceRegistrationNumber: trimmedInvoice || null,
        paymentTerms: usePaymentTerms ? terms : null,
      })
      onOpenChange(false)
    },
    [
      name,
      isInternal,
      invoiceNumber,
      usePaymentTerms,
      terms,
      onSubmit,
      onOpenChange,
    ],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {company ? '所属会社を編集' : '所属会社を追加'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">名称</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名称を入力"
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="company-is-internal"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="company-is-internal">
              内部リソース（自社）として人件費計上する
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-invoice-number">
              インボイス登録番号（適格請求書発行事業者、任意）
            </Label>
            <Input
              id="company-invoice-number"
              value={invoiceNumber}
              onChange={(e) => {
                setInvoiceNumber(e.target.value)
                setInvoiceError(null)
              }}
              placeholder="T1234567890123"
              maxLength={14}
            />
            {invoiceError && (
              <p className="text-sm text-destructive">{invoiceError}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={usePaymentTerms}
                onChange={(e) => setUsePaymentTerms(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              支払サイトを設定する（支払明細に支払期日を表示）
            </label>
            {usePaymentTerms && (
              <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
                <select
                  aria-label="締め日"
                  className="rounded border border-border bg-background px-1.5 py-1"
                  value={terms.closingDay}
                  onChange={(e) =>
                    setTerms((t) => ({
                      ...t,
                      closingDay: Number(e.target.value),
                    }))
                  }
                >
                  {[5, 10, 15, 20, 25, 31].map((d) => (
                    <option key={d} value={d}>
                      {d >= 31 ? '月末' : `${d}日`}
                    </option>
                  ))}
                </select>
                <span>締め</span>
                <select
                  aria-label="支払月"
                  className="rounded border border-border bg-background px-1.5 py-1"
                  value={terms.paymentMonthOffset}
                  onChange={(e) =>
                    setTerms((t) => ({
                      ...t,
                      paymentMonthOffset: Number(e.target.value),
                    }))
                  }
                >
                  <option value={0}>当月</option>
                  <option value={1}>翌月</option>
                  <option value={2}>翌々月</option>
                </select>
                <select
                  aria-label="支払日"
                  className="rounded border border-border bg-background px-1.5 py-1"
                  value={terms.paymentDay}
                  onChange={(e) =>
                    setTerms((t) => ({
                      ...t,
                      paymentDay: Number(e.target.value),
                    }))
                  }
                >
                  {[5, 10, 15, 20, 25, 31].map((d) => (
                    <option key={d} value={d}>
                      {d >= 31 ? '末' : `${d}日`}
                    </option>
                  ))}
                </select>
                <span>払い</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={name.trim().length === 0}>
              {company ? '更新' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
