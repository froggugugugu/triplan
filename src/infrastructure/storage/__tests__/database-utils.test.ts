import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jsonStorage } from '@/infrastructure/storage/json-storage'
import {
  calendarMonthToFiscalMonth,
  DatabaseSchema,
  fiscalMonthToCalendarMonth,
  getFiscalMonthLabel,
} from '@/shared/types/database'

describe('fiscalMonthToCalendarMonth', () => {
  it('should convert fiscal month 1 to April (4)', () => {
    expect(fiscalMonthToCalendarMonth(1)).toBe(4)
  })

  it('should convert fiscal month 9 to December (12)', () => {
    expect(fiscalMonthToCalendarMonth(9)).toBe(12)
  })

  it('should convert fiscal month 10 to January (1)', () => {
    expect(fiscalMonthToCalendarMonth(10)).toBe(1)
  })

  it('should convert fiscal month 12 to March (3)', () => {
    expect(fiscalMonthToCalendarMonth(12)).toBe(3)
  })
})

describe('calendarMonthToFiscalMonth', () => {
  it('should convert April (4) to fiscal month 1', () => {
    expect(calendarMonthToFiscalMonth(4)).toBe(1)
  })

  it('should convert March (3) to fiscal month 12', () => {
    expect(calendarMonthToFiscalMonth(3)).toBe(12)
  })

  it('should convert January (1) to fiscal month 10', () => {
    expect(calendarMonthToFiscalMonth(1)).toBe(10)
  })
})

describe('getFiscalMonthLabel', () => {
  it('should return 4月 for fiscal month 1', () => {
    expect(getFiscalMonthLabel(1)).toBe('4月')
  })

  it('should return 3月 for fiscal month 12', () => {
    expect(getFiscalMonthLabel(12)).toBe('3月')
  })
})

describe('fiscalMonthToCalendarMonth with custom startMonth', () => {
  it('startMonth=1 (1月始まり): fiscal month 1 → January (1)', () => {
    expect(fiscalMonthToCalendarMonth(1, 1)).toBe(1)
  })

  it('startMonth=1: fiscal month 12 → December (12)', () => {
    expect(fiscalMonthToCalendarMonth(12, 1)).toBe(12)
  })

  it('startMonth=10 (10月始まり): fiscal month 1 → October (10)', () => {
    expect(fiscalMonthToCalendarMonth(1, 10)).toBe(10)
  })

  it('startMonth=10: fiscal month 3 → December (12)', () => {
    expect(fiscalMonthToCalendarMonth(3, 10)).toBe(12)
  })

  it('startMonth=10: fiscal month 4 → January (1)', () => {
    expect(fiscalMonthToCalendarMonth(4, 10)).toBe(1)
  })

  it('startMonth=10: fiscal month 12 → September (9)', () => {
    expect(fiscalMonthToCalendarMonth(12, 10)).toBe(9)
  })
})

describe('calendarMonthToFiscalMonth with custom startMonth', () => {
  it('startMonth=1 (1月始まり): January (1) → fiscal month 1', () => {
    expect(calendarMonthToFiscalMonth(1, 1)).toBe(1)
  })

  it('startMonth=1: December (12) → fiscal month 12', () => {
    expect(calendarMonthToFiscalMonth(12, 1)).toBe(12)
  })

  it('startMonth=10 (10月始まり): October (10) → fiscal month 1', () => {
    expect(calendarMonthToFiscalMonth(10, 10)).toBe(1)
  })

  it('startMonth=10: September (9) → fiscal month 12', () => {
    expect(calendarMonthToFiscalMonth(9, 10)).toBe(12)
  })

  it('startMonth=10: January (1) → fiscal month 4', () => {
    expect(calendarMonthToFiscalMonth(1, 10)).toBe(4)
  })
})

describe('getFiscalMonthLabel with custom startMonth', () => {
  it('startMonth=1: fiscal month 1 → 1月', () => {
    expect(getFiscalMonthLabel(1, 1)).toBe('1月')
  })

  it('startMonth=10: fiscal month 1 → 10月', () => {
    expect(getFiscalMonthLabel(1, 10)).toBe('10月')
  })
})

describe('Project data migration (status/confidence defaults)', () => {
  const baseDatabase = {
    version: '1.0.0',
    fiscalYear: 2025,
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  const baseProject = {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('should assign default status and confidence to projects without these fields', () => {
    const data = {
      ...baseDatabase,
      projects: [baseProject],
    }

    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projects[0]?.status).toBe('not_started')
    expect(parsed.projects[0]?.confidence).toBeNull()
  })

  it('should preserve existing status and confidence values', () => {
    const data = {
      ...baseDatabase,
      projects: [{ ...baseProject, status: 'active', confidence: 'A' }],
    }

    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projects[0]?.status).toBe('active')
    expect(parsed.projects[0]?.confidence).toBe('A')
  })

  it('should handle mixed data (some projects with fields, some without)', () => {
    const project2 = {
      ...baseProject,
      id: crypto.randomUUID(),
      code: 'P002',
      name: '既存案件',
      status: 'completed' as const,
      confidence: 'S' as const,
    }

    const data = {
      ...baseDatabase,
      projects: [baseProject, project2],
    }

    const parsed = DatabaseSchema.parse(data)
    // Project without fields gets defaults
    expect(parsed.projects[0]?.status).toBe('not_started')
    expect(parsed.projects[0]?.confidence).toBeNull()
    // Project with fields preserves values
    expect(parsed.projects[1]?.status).toBe('completed')
    expect(parsed.projects[1]?.confidence).toBe('S')
  })
})

// : WBS完了フラグ（Project.completed）の後方互換
describe('Project data migration (completed default)', () => {
  const baseDatabase = {
    version: '1.0.0',
    fiscalYear: 2025,
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  const baseProject = {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('should assign default completed=false to projects without this field', () => {
    const data = {
      ...baseDatabase,
      projects: [baseProject],
    }

    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projects[0]?.completed).toBe(false)
  })

  it('should preserve existing completed=true value', () => {
    const data = {
      ...baseDatabase,
      projects: [{ ...baseProject, completed: true }],
    }

    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projects[0]?.completed).toBe(true)
  })
})

describe('Project data migration (divisionId default via jsonStorage)', () => {
  const baseDatabase = {
    version: '1.0.0',
    fiscalYear: 2025,
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  const baseProject = {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('既存のdivisionId値はjsonStorage.import()経由で保持される', () => {
    const divisionId = '00000000-0000-4000-8000-000000000002'
    const legacyJson = JSON.stringify({
      ...baseDatabase,
      projects: [{ ...baseProject, divisionId }],
    })
    const result = jsonStorage.import(legacyJson)
    expect(result.projects[0]?.divisionId).toBe(divisionId)
  })

  // 反証: divisionIdは.default()を持たないため、フィールド自体が無い場合はundefinedのまま
  // （status/confidenceとは異なる）。利用側は`?? null`で扱う契約
  it('DatabaseSchema.parse()単体ではdivisionId未指定時にundefinedのまま（zod defaultなし）', () => {
    const data = { ...baseDatabase, projects: [baseProject] }
    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projects[0]?.divisionId).toBeUndefined()
  })
})

describe('Project data migration (clientName/contractAmount/priority default via jsonStorage)', () => {
  const baseDatabase = {
    version: '1.0.0',
    fiscalYear: 2025,
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  const baseProject = {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('既存のclientName/contractAmount/priority値はjsonStorage.import()経由で保持される', () => {
    const legacyJson = JSON.stringify({
      ...baseDatabase,
      projects: [
        {
          ...baseProject,
          clientName: '株式会社サンプル',
          contractAmount: 800,
          priority: 'high',
        },
      ],
    })
    const result = jsonStorage.import(legacyJson)
    expect(result.projects[0]?.clientName).toBe('株式会社サンプル')
    expect(result.projects[0]?.contractAmount).toBe(800)
    expect(result.projects[0]?.priority).toBe('high')
  })
})

describe('Member data migration (email default via jsonStorage)', () => {
  const baseDatabase = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  const baseMember = {
    id: crypto.randomUUID(),
    name: 'テスト担当者',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('既存のemail値はjsonStorage.import()経由で保持される', () => {
    const legacyJson = JSON.stringify({
      ...baseDatabase,
      members: [{ ...baseMember, email: 'test@example.com' }],
    })
    const result = jsonStorage.import(legacyJson)
    expect(result.members[0]?.email).toBe('test@example.com')
  })
})

describe('projectProgressEntries（新設フィールド）の後方互換', () => {
  it('projectProgressEntriesが無い既存データはDatabaseSchema.parse()でundefinedのまま', () => {
    const data = {
      version: '1.0.0',
      fiscalYear: 2025,
      projects: [],
      members: [],
      metadata: {
        lastModified: new Date().toISOString(),
        createdBy: 'system',
        version: '1.0.0',
      },
    }
    const parsed = DatabaseSchema.parse(data)
    expect(parsed.projectProgressEntries).toBeUndefined()
  })
})
