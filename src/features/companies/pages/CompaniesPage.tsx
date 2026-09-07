import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CompanyDialog } from '@/features/companies/components/CompanyDialog'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { useToast } from '@/shared/hooks/use-toast'
import type { Company } from '@/shared/types/company'
import { type CompanyExtras, useCompaniesStore } from '@/stores'

export function CompaniesPage() {
  const { toast } = useToast()
  const companies = useCompaniesStore((s) => s.companies)
  const loadCompanies = useCompaniesStore((s) => s.loadCompanies)
  const addCompany = useCompaniesStore((s) => s.addCompany)
  const updateCompany = useCompaniesStore((s) => s.updateCompany)
  const deleteCompany = useCompaniesStore((s) => s.deleteCompany)

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.sortOrder - b.sortOrder),
    [companies],
  )

  const handleAdd = useCallback(() => {
    setEditingCompany(null)
    setCompanyDialogOpen(true)
  }, [])

  const handleEdit = useCallback((company: Company) => {
    setEditingCompany(company)
    setCompanyDialogOpen(true)
  }, [])

  const handleDialogSubmit = useCallback(
    (name: string, isInternal: boolean, extras: CompanyExtras) => {
      if (editingCompany) {
        updateCompany(editingCompany.id, name, isInternal, extras)
        toast({ title: '所属会社を更新しました' })
      } else {
        addCompany(name, isInternal, extras)
        toast({ title: '所属会社を追加しました' })
      }
    },
    [editingCompany, addCompany, updateCompany, toast],
  )

  const handleDelete = useCallback((company: Company) => {
    setDeleteTarget(company)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteCompany(deleteTarget.id)
    toast({ title: '所属会社を削除しました' })
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }, [deleteTarget, deleteCompany, toast])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">所属会社</h1>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          所属会社を追加
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {sortedCompanies.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            所属会社が登録されていません。「所属会社を追加」ボタンから登録してください。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedCompanies.map((company) => (
              <div
                key={company.id}
                className="group flex items-center gap-2 px-4 py-3"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{company.name}</span>
                {company.isInternal && (
                  <Badge variant="outline" className="text-xs">
                    内部リソース
                  </Badge>
                )}
                <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEdit(company)}
                    title="所属会社名を編集"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(company)}
                    title="所属会社を削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CompanyDialog
        open={companyDialogOpen}
        onOpenChange={setCompanyDialogOpen}
        company={editingCompany}
        onSubmit={handleDialogSubmit}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除の確認</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}
              」を削除しますか？所属していたメンバーは未設定になります（契約単価履歴は保持されます）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
