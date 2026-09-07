import { create } from 'zustand'
import { getDataAdapter } from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type { Company, PaymentTerms } from '@/shared/types/company'
import { useMembersStore } from './members-store'
import {
  describeSaveFailure,
  isConflictError,
  isStorageQuotaError,
} from './persistence-error'

/** 取引先属性（支払サイト・インボイス登録番号）。undefined=変更しない */
export interface CompanyExtras {
  invoiceRegistrationNumber?: string | null
  paymentTerms?: PaymentTerms | null
}

interface CompaniesState {
  companies: Company[]

  // Actions
  loadCompanies: () => void
  addCompany: (
    name: string,
    isInternal?: boolean,
    extras?: CompanyExtras,
  ) => Company
  updateCompany: (
    id: string,
    name: string,
    isInternal?: boolean,
    extras?: CompanyExtras,
  ) => void
  deleteCompany: (id: string) => void

  // Selectors
  getCompanyById: (id: string) => Company | undefined
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `所属会社の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

export const useCompaniesStore = create<CompaniesState>()((set, get) => ({
  companies: [],

  loadCompanies: () => {
    getDataAdapter()
      .list('companies')
      .then((companies) => set({ companies }))
      .catch((error: unknown) => notifyPersistenceFailure('読み込み', error))
  },

  // 楽観的更新（非公開の設計文書/§7.2）。
  // idはここでクライアント生成し、DataAdapter.create()のoptions.idで確定id同様に固定する
  // （確定後にidが変わる設計だと、戻り値を同期的に連鎖利用する呼び出し元＝applyWbsTemplate等が
  // 壊れるため。詳細はdocs/project.md「17ストアのDataAdapter配線」参照）
  addCompany: (name, isInternal = false, extras) => {
    const now = new Date().toISOString()
    const maxSortOrder = get().companies.reduce(
      (max, c) => Math.max(max, c.sortOrder),
      -1,
    )
    const sortOrder = maxSortOrder + 1
    const id = crypto.randomUUID()
    const optimisticCompany: Company = {
      id,
      name,
      sortOrder,
      isInternal,
      invoiceRegistrationNumber: extras?.invoiceRegistrationNumber ?? null,
      paymentTerms: extras?.paymentTerms ?? null,
      createdAt: now,
      updatedAt: now,
    }

    set((state) => ({ companies: [...state.companies, optimisticCompany] }))

    getDataAdapter()
      .create(
        'companies',
        {
          name,
          sortOrder,
          isInternal,
          invoiceRegistrationNumber: extras?.invoiceRegistrationNumber ?? null,
          paymentTerms: extras?.paymentTerms ?? null,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          companies: state.companies.map((c) => (c.id === id ? created : c)),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          companies: state.companies.filter((c) => c.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return optimisticCompany
  },

  updateCompany: (id, name, isInternal, extras) => {
    const previous = get().companies
    // 楽観ロック: 画面が見ていたレコードのupdatedAtを期待値として送る。
    // 他のユーザーが先に更新していればサーバーが412で拒否し、後勝ちの上書きを防ぐ
    const expectedUpdatedAt = previous.find((c) => c.id === id)?.updatedAt
    const now = new Date().toISOString()
    // isInternal未指定時はキー自体を省略する（{isInternal: undefined}を含めると
    // スプレッド代入で既存値が上書きされてしまうため）。extras側も同じ3値セマンティクス
    // （undefined=変更なし／null=クリア／値=設定）
    const patch: Partial<
      Pick<
        Company,
        | 'name'
        | 'isInternal'
        | 'invoiceRegistrationNumber'
        | 'paymentTerms'
        | 'updatedAt'
      >
    > = {
      name,
      updatedAt: now,
    }
    if (isInternal !== undefined) {
      patch.isInternal = isInternal
    }
    if (extras?.invoiceRegistrationNumber !== undefined) {
      patch.invoiceRegistrationNumber = extras.invoiceRegistrationNumber
    }
    if (extras?.paymentTerms !== undefined) {
      patch.paymentTerms = extras.paymentTerms
    }

    set((state) => ({
      companies: state.companies.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }))

    getDataAdapter()
      .update('companies', id, patch, { expectedUpdatedAt })
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          companies: state.companies.map((c) => (c.id === id ? saved : c)),
        }))
      })
      .catch((error: unknown) => {
        set({ companies: previous })
        notifyPersistenceFailure('更新', error)
      })
  },

  deleteCompany: (id) => {
    const previous = get().companies
    set((state) => ({
      companies: state.companies.filter((c) => c.id !== id),
    }))

    getDataAdapter()
      .remove('companies', id)
      .catch((error: unknown) => {
        set({ companies: previous })
        notifyPersistenceFailure('削除', error)
      })

    // メンバーのcompanyIdをnullに更新（契約単価履歴は記録として保持する）
    const membersStore = useMembersStore.getState()
    const affectedMembers = membersStore.members.filter(
      (m) => m.companyId === id,
    )
    for (const member of affectedMembers) {
      membersStore.updateMember({ id: member.id, companyId: null })
    }
  },

  getCompanyById: (id) => {
    return get().companies.find((c) => c.id === id)
  },
}))
