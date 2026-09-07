import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCsvMappingStore } from '@/stores'
import { CsvMappingExportDialog } from '../CsvMappingExportDialog'

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/infrastructure/adapters', () => ({
  getDataAdapter: () => ({
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  }),
}))

const toastMock = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: (...args: unknown[]) => toastMock(...args),
}))

const SOURCE = {
  key: 'billing',
  label: '請求データ（請求マイルストン）',
  fields: [
    { key: 'projectCode', label: 'プロジェクトコード' },
    { key: 'amount', label: '請求額（万円）' },
    { key: 'status', label: 'ステータス' },
  ],
}

const ROWS = [
  { projectCode: 'P001', amount: 500, status: '検収済' },
  { projectCode: 'P002', amount: 300, status: '予定' },
]

function renderDialog() {
  return render(
    <CsvMappingExportDialog
      open
      onOpenChange={() => {}}
      source={SOURCE}
      rows={ROWS}
      fileName="請求データ_2026年度"
    />,
  )
}

describe('CsvMappingExportDialog', () => {
  beforeEach(() => {
    toastMock.mockClear()
    vi.clearAllMocks()
    useCsvMappingStore.setState({ csvMappingProfiles: [] })
    mockList.mockResolvedValue([])
    mockCreate.mockImplementation(
      async (
        _entity: string,
        data: Record<string, unknown>,
        options?: { id?: string },
      ) => ({ ...data, id: options?.id ?? crypto.randomUUID() }),
    )
  })

  afterEach(() => cleanup())

  it('既定では全列がカタログ順でプレビューに表示される', () => {
    renderDialog()
    expect(
      screen.getByRole('columnheader', { name: 'プロジェクトコード' }),
    ).toBeInTheDocument()
    expect(screen.getByText('P001')).toBeInTheDocument()
    expect(
      screen.getByText('3列を出力（UTF-8 BOM付き・Excelでそのまま開けます）'),
    ).toBeInTheDocument()
  })

  it('反証: 列を無効化するとプレビューのヘッダ・値から消え、出力列数が減る', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(
      screen.getByRole('checkbox', { name: 'ステータスを出力する' }),
    )
    expect(
      screen.queryByRole('columnheader', { name: 'ステータス' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('検収済')).not.toBeInTheDocument()
    expect(
      screen.getByText('2列を出力（UTF-8 BOM付き・Excelでそのまま開けます）'),
    ).toBeInTheDocument()
  })

  it('ヘッダ名の変更がプレビューへ即時反映される（外部システム側の列名へ改名）', async () => {
    const user = userEvent.setup()
    renderDialog()
    const headerInput = screen.getByRole('textbox', {
      name: 'プロジェクトコードのヘッダ名',
    })
    await user.clear(headerInput)
    await user.type(headerInput, '伝票番号')
    expect(
      screen.getByRole('columnheader', { name: '伝票番号' }),
    ).toBeInTheDocument()
  })

  it('プロファイル保存で編集内容（無効化・改名）がstoreへ保存される', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(
      screen.getByRole('checkbox', { name: 'ステータスを出力する' }),
    )
    const headerInput = screen.getByRole('textbox', {
      name: 'プロジェクトコードのヘッダ名',
    })
    await user.clear(headerInput)
    await user.type(headerInput, '伝票番号')
    await user.type(
      screen.getByRole('textbox', { name: 'プロファイル名' }),
      '会計ソフトA向け',
    )
    await user.click(screen.getByRole('button', { name: /保存/ }))

    const saved = useCsvMappingStore.getState().csvMappingProfiles[0]
    expect(saved).toMatchObject({
      name: '会計ソフトA向け',
      sourceKey: 'billing',
      direction: 'export',
    })
    const statusColumn = saved?.columns.find((c) => c.field === 'status')
    expect(statusColumn?.enabled).toBe(false)
    const codeColumn = saved?.columns.find((c) => c.field === 'projectCode')
    expect(codeColumn?.header).toBe('伝票番号')
  })

  it('反証: プロファイル名が空のまま保存するとstoreへ保存されない', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /保存/ }))
    expect(useCsvMappingStore.getState().csvMappingProfiles).toHaveLength(0)
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    )
  })

  it('反証: 全列を無効にするとダウンロードボタンが無効化される（空CSVを出させない）', async () => {
    const user = userEvent.setup()
    renderDialog()
    for (const field of SOURCE.fields) {
      await user.click(
        screen.getByRole('checkbox', { name: `${field.label}を出力する` }),
      )
    }
    expect(
      screen.getByRole('button', { name: /CSVをダウンロード/ }),
    ).toBeDisabled()
  })

  it('並び替え（下へ）でプレビューの列順が入れ替わる', async () => {
    const user = userEvent.setup()
    renderDialog()
    // 1行目（プロジェクトコード）の「下へ」を押す
    const editorRows = screen.getAllByRole('row')
    const firstEditorRow = editorRows.find((r) =>
      within(r).queryByRole('textbox', {
        name: 'プロジェクトコードのヘッダ名',
      }),
    )
    expect(firstEditorRow).toBeDefined()
    await user.click(
      within(firstEditorRow as HTMLElement).getByRole('button', {
        name: '下へ',
      }),
    )
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    // プレビュー側のヘッダ順: 請求額 → プロジェクトコード → ステータス
    const previewStart = headers.indexOf('請求額（万円）')
    expect(previewStart).toBeGreaterThanOrEqual(0)
    expect(headers[previewStart + 1]).toBe('プロジェクトコード')
  })
})
