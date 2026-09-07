import { describe, expect, it } from 'vitest'
import {
  ActualsImportLogSchema,
  CreateActualsImportLogSchema,
  CreateMonthlyActualsConfirmationSchema,
  CreateMonthlyCloseEventSchema,
  MonthlyActualsConfirmationSchema,
  MonthlyCloseEventSchema,
} from '@/shared/types/actuals'
import { DatabaseSchema } from '@/shared/types/database'

const VALID_CONFIRMATION = {
  id: crypto.randomUUID(),
  month: '2025-04',
  confirmedAt: '2025-05-01T09:00:00.000Z',
}

const VALID_IMPORT_LOG = {
  id: crypto.randomUUID(),
  importedAt: '2025-05-01T09:00:00.000Z',
  fileName: 'timesheet-2025-04.csv',
  targetMonths: ['2025-04'],
  appliedCount: 12,
  skippedCount: 2,
  skippedReasons: [
    { row: 3, reason: 'メンバーが見つかりません' },
    { row: 8, reason: 'タスクが見つかりません' },
  ],
  note: null,
}

describe('MonthlyActualsConfirmationSchema', () => {
  it('正常な確定マークを受理する', () => {
    expect(
      MonthlyActualsConfirmationSchema.safeParse(VALID_CONFIRMATION).success,
    ).toBe(true)
  })

  it('反証: monthはYYYY-MM形式以外を拒否する', () => {
    for (const month of ['2025-4', '2025/04', '2025-04-01', 'abc', '']) {
      expect(
        MonthlyActualsConfirmationSchema.safeParse({
          ...VALID_CONFIRMATION,
          month,
        }).success,
      ).toBe(false)
    }
  })

  it('反証: confirmedAtはISO 8601 datetime以外を拒否する', () => {
    expect(
      MonthlyActualsConfirmationSchema.safeParse({
        ...VALID_CONFIRMATION,
        confirmedAt: '2025-05-01',
      }).success,
    ).toBe(false)
  })

  it('Createスキーマはidを含まない', () => {
    const { id: _id, ...rest } = VALID_CONFIRMATION
    const parsed = CreateMonthlyActualsConfirmationSchema.safeParse(rest)
    expect(parsed.success).toBe(true)
    // idキーは自動的にstripされる（crud-factoryのid合流パターンの前提）
    const withId =
      CreateMonthlyActualsConfirmationSchema.safeParse(VALID_CONFIRMATION)
    expect(withId.success).toBe(true)
    if (withId.success) {
      expect('id' in withId.data).toBe(false)
    }
  })
})

describe('ActualsImportLogSchema', () => {
  it('正常な取込履歴を受理する', () => {
    expect(ActualsImportLogSchema.safeParse(VALID_IMPORT_LOG).success).toBe(
      true,
    )
  })

  it('noteはnull許容・500文字上限', () => {
    expect(
      ActualsImportLogSchema.safeParse({ ...VALID_IMPORT_LOG, note: '補足' })
        .success,
    ).toBe(true)
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        note: 'a'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('反証: fileName空文字・256文字は拒否する', () => {
    expect(
      ActualsImportLogSchema.safeParse({ ...VALID_IMPORT_LOG, fileName: '' })
        .success,
    ).toBe(false)
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        fileName: 'a'.repeat(256),
      }).success,
    ).toBe(false)
  })

  it('反証: appliedCount/skippedCountの負値・小数は拒否する', () => {
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        appliedCount: -1,
      }).success,
    ).toBe(false)
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        skippedCount: 1.5,
      }).success,
    ).toBe(false)
  })

  it('反証: skippedReasonsは101件を拒否する（100件上限の打ち切り契約）', () => {
    const reasons = Array.from({ length: 101 }, (_, i) => ({
      row: i + 1,
      reason: 'x',
    }))
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        skippedReasons: reasons,
      }).success,
    ).toBe(false)
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        skippedReasons: reasons.slice(0, 100),
      }).success,
    ).toBe(true)
  })

  it('反証: targetMonthsに不正な月キーを含むと拒否する', () => {
    expect(
      ActualsImportLogSchema.safeParse({
        ...VALID_IMPORT_LOG,
        targetMonths: ['2025-04', '2025-4'],
      }).success,
    ).toBe(false)
  })

  it('Createスキーマはidを除外する', () => {
    const { id: _id, ...rest } = VALID_IMPORT_LOG
    expect(CreateActualsImportLogSchema.safeParse(rest).success).toBe(true)
  })
})

describe('DatabaseSchemaへの統合', () => {
  const MINIMAL_DB = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    metadata: {
      lastModified: '2025-04-01T00:00:00.000Z',
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  it('反証: 新フィールドが無い既存データもパースできる（後方互換）', () => {
    expect(DatabaseSchema.safeParse(MINIMAL_DB).success).toBe(true)
  })

  it('monthlyActualsConfirmations/actualsImportLogs/hoursPerDayを受理する', () => {
    const parsed = DatabaseSchema.safeParse({
      ...MINIMAL_DB,
      monthlyActualsConfirmations: [VALID_CONFIRMATION],
      actualsImportLogs: [VALID_IMPORT_LOG],
      hoursPerDay: 7.5,
    })
    expect(parsed.success).toBe(true)
  })

  it('反証: hoursPerDayの0以下は拒否する', () => {
    expect(
      DatabaseSchema.safeParse({ ...MINIMAL_DB, hoursPerDay: 0 }).success,
    ).toBe(false)
    expect(
      DatabaseSchema.safeParse({ ...MINIMAL_DB, hoursPerDay: -8 }).success,
    ).toBe(false)
  })
})

describe('MonthlyCloseEventSchema（P1-b月次締め）', () => {
  const VALID_CLOSE = {
    id: crypto.randomUUID(),
    month: '2025-09',
    action: 'close' as const,
    reason: null,
    occurredAt: '2025-10-05T09:00:00.000Z',
    actorName: null,
  }

  it('close（理由null）とreopen（理由あり）を受理する', () => {
    expect(MonthlyCloseEventSchema.safeParse(VALID_CLOSE).success).toBe(true)
    expect(
      MonthlyCloseEventSchema.safeParse({
        ...VALID_CLOSE,
        action: 'reopen',
        reason: '検収差戻しのため再集計',
      }).success,
    ).toBe(true)
  })

  it('反証: 定義外のaction・空文字の理由は拒否する', () => {
    expect(
      MonthlyCloseEventSchema.safeParse({ ...VALID_CLOSE, action: 'lock' })
        .success,
    ).toBe(false)
    // 理由は「無し（null）」か「1文字以上」で、空文字は入れさせない
    expect(
      MonthlyCloseEventSchema.safeParse({ ...VALID_CLOSE, reason: '' }).success,
    ).toBe(false)
  })

  it('反証: monthの不正形式・501文字の理由は拒否する', () => {
    expect(
      MonthlyCloseEventSchema.safeParse({ ...VALID_CLOSE, month: '2025-9' })
        .success,
    ).toBe(false)
    expect(
      MonthlyCloseEventSchema.safeParse({
        ...VALID_CLOSE,
        reason: 'a'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('actorNameは文字列またはnull', () => {
    expect(
      MonthlyCloseEventSchema.safeParse({
        ...VALID_CLOSE,
        actorName: 'manager@example.com',
      }).success,
    ).toBe(true)
  })

  it('Createスキーマはidを除外する', () => {
    const { id: _id, ...rest } = VALID_CLOSE
    expect(CreateMonthlyCloseEventSchema.safeParse(rest).success).toBe(true)
  })

  it('DatabaseSchemaへの統合: monthlyCloseEventsを受理し、無くても後方互換', () => {
    const MINIMAL_DB = {
      version: '1.0.0',
      fiscalYear: 2025,
      projects: [],
      members: [],
      metadata: {
        lastModified: '2025-04-01T00:00:00.000Z',
        createdBy: 'test',
        version: '1.0.0',
      },
    }
    expect(DatabaseSchema.safeParse(MINIMAL_DB).success).toBe(true)
    expect(
      DatabaseSchema.safeParse({
        ...MINIMAL_DB,
        monthlyCloseEvents: [VALID_CLOSE],
      }).success,
    ).toBe(true)
  })
})
