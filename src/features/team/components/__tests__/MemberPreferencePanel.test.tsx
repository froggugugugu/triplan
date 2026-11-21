import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSchema, type Member } from '@/shared/types'
import { useMemberPreferenceStore } from '@/stores'
import { MemberPreferencePanel } from '../MemberPreferencePanel'

const MEMBER_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_MEMBER_ID = '00000000-0000-4000-8000-0000000000a2'
const PROJ = '00000000-0000-4000-8000-0000000000c1'
const TASK = '00000000-0000-4000-8000-0000000000c2'
const TAG = '00000000-0000-4000-8000-0000000000d1'
const NOW = '2026-04-01T00:00:00.000Z'

const member: Member = {
  id: MEMBER_ID,
  name: '青木',
  sectionId: null,
  role: '開発',
  isActive: true,
  startDate: null,
  endDate: null,
  unitPriceHistory: [],
  createdAt: NOW,
  updatedAt: NOW,
}

function seed(preferences: unknown[] = [], extraRoots = 0) {
  const project = (id: string, parentId: string | null, name: string) => ({
    id,
    code: id.slice(-4),
    name,
    parentId,
    level: parentId ? 1 : 0,
    status: 'active',
    confidence: 'S',
    createdAt: NOW,
    updatedAt: NOW,
  })
  const db = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [
      project(PROJ, null, '基幹刷新'),
      project(TASK, PROJ, '設計タスク'),
      ...Array.from({ length: extraRoots }, (_, i) =>
        project(
          `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
          null,
          `製品${String(i + 1).padStart(2, '0')}`,
        ),
      ),
    ],
    members: [member],
    assignments: [],
    techTags: [
      {
        id: TAG,
        name: 'Rust',
        color: '#334455',
        categoryId: '00000000-0000-4000-8000-0000000000d9',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    memberPreferences: preferences,
    metadata: { lastModified: NOW, createdBy: 'test', version: '1.0.0' },
  }
  localStorage.setItem(
    'resource-manager-data',
    JSON.stringify(DatabaseSchema.parse(db)),
  )
}

function persisted() {
  return JSON.parse(localStorage.getItem('resource-manager-data') ?? '{}')
    .memberPreferences as Array<Record<string, unknown>>
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
  await user.keyboard('{Escape}')
}

describe('MemberPreferencePanel', () => {
  beforeEach(() => {
    localStorage.clear()
    useMemberPreferenceStore.setState({ preferences: [] })
  })
  afterEach(() => localStorage.clear())

  it('了解日と希望を入れて保存すると登録される。自由記述欄は存在しない', async () => {
    seed()
    const user = userEvent.setup()
    render(<MemberPreferencePanel member={member} readOnly={false} />)

    const save = await screen.findByRole('button', { name: '希望を保存' })
    // 了解日も希望もないうちは保存できない
    expect(save).toBeDisabled()

    await pick(user, 'やりたいプロダクト', '基幹刷新')
    await pick(user, '伸ばしたいスキル', 'Rust')
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('本人の了解を得た日'), '2026-04-10')
    expect(save).toBeEnabled()

    // 1on1 の会話内容を入れる欄を置かない
    expect(
      screen.queryByRole('textbox', { name: /メモ|備考|コメント/ }),
    ).not.toBeInTheDocument()

    await user.click(save)
    await waitFor(() => expect(persisted()).toHaveLength(1))
    expect(persisted()[0]).toMatchObject({
      memberId: MEMBER_ID,
      desiredProductIds: [PROJ],
      desiredTechTagIds: [TAG],
      consentedAt: '2026-04-10',
    })
  })

  it('プロダクトの候補はルート案件だけ（タスクは出ない）', async () => {
    seed()
    const user = userEvent.setup()
    render(<MemberPreferencePanel member={member} readOnly={false} />)
    await user.click(
      await screen.findByRole('combobox', { name: 'やりたいプロダクト' }),
    )
    expect(
      await screen.findByRole('option', { name: '基幹刷新' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: '設計タスク' }),
    ).not.toBeInTheDocument()
  })

  it('了解日が未来日なら保存できず、理由を示す', async () => {
    seed()
    const user = userEvent.setup()
    render(<MemberPreferencePanel member={member} readOnly={false} />)
    await pick(user, 'やりたいプロダクト', '基幹刷新')
    await user.type(
      await screen.findByLabelText('本人の了解を得た日'),
      '2999-01-01',
    )
    expect(screen.getByRole('button', { name: '希望を保存' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('未来の日付')
  })

  it('登録済みの希望を読み込み、取り下げると削除される（他人の希望は残る）', async () => {
    const pref = (id: string, memberId: string) => ({
      id,
      memberId,
      desiredProductIds: [PROJ],
      desiredTechTagIds: [],
      consentedAt: '2026-04-01',
      createdAt: NOW,
      updatedAt: NOW,
    })
    seed([
      pref('00000000-0000-4000-8000-0000000000e1', MEMBER_ID),
      pref('00000000-0000-4000-8000-0000000000e2', OTHER_MEMBER_ID),
    ])
    const user = userEvent.setup()
    render(<MemberPreferencePanel member={member} readOnly={false} />)

    expect(await screen.findByDisplayValue('2026-04-01')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /了解の取り下げ/ }))
    // 取り消せない操作なので確認を挟む
    const confirm = screen.getByRole('group', { name: '取り下げの確認' })
    await user.click(within(confirm).getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(persisted()).toHaveLength(1))
    expect(persisted()[0]?.memberId).toBe(OTHER_MEMBER_ID)
  })

  it('11件目は追加されず、上限を知らせる', async () => {
    seed([], 10)
    const user = userEvent.setup()
    render(<MemberPreferencePanel member={member} readOnly={false} />)
    await user.click(
      await screen.findByRole('combobox', { name: 'やりたいプロダクト' }),
    )
    for (let i = 1; i <= 10; i++) {
      await user.click(
        await screen.findByRole('option', {
          name: `製品${String(i).padStart(2, '0')}`,
        }),
      )
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '基幹刷新' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('alert')).toHaveTextContent('最大10件')
    expect(screen.queryByText('基幹刷新')).not.toBeInTheDocument()
    expect(screen.getByText('製品10')).toBeInTheDocument()
  })

  it('閲覧のみでは入力・保存・取り下げを出さない', async () => {
    seed([
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        memberId: MEMBER_ID,
        desiredProductIds: [PROJ],
        desiredTechTagIds: [TAG],
        consentedAt: '2026-04-01',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    render(<MemberPreferencePanel member={member} readOnly />)
    expect(await screen.findByText('基幹刷新')).toBeInTheDocument()
    expect(screen.getByText('Rust')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '希望を保存' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /了解の取り下げ/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('本人の了解を得た日'),
    ).not.toBeInTheDocument()
  })
})
