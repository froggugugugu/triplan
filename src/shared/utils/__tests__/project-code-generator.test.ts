import { describe, expect, it } from 'vitest'
import { generateProjectCode } from '@/shared/utils/project-code-generator'

describe('generateProjectCode', () => {
  it('should generate first project code as P001', () => {
    const code = generateProjectCode(0, [], null)
    expect(code).toBe('P001')
  })

  it('should increment project code based on existing projects', () => {
    const existing = [
      { code: 'P001', level: 0, parentId: null },
      { code: 'P002', level: 0, parentId: null },
    ]
    const code = generateProjectCode(0, existing, null)
    expect(code).toBe('P003')
  })

  it('should generate first level-1 code as P001-01', () => {
    const code = generateProjectCode(1, [], 'parent-1', 'P001')
    expect(code).toBe('P001-01')
  })

  it('should increment level-1 code', () => {
    const existing = [
      { code: 'P001-01', level: 1, parentId: 'parent-1' },
      { code: 'P001-02', level: 1, parentId: 'parent-1' },
    ]
    const code = generateProjectCode(1, existing, 'parent-1', 'P001')
    expect(code).toBe('P001-03')
  })

  it('should generate first level-5 code as P001-01-001', () => {
    const code = generateProjectCode(5, [], 'parent-2', 'P001-01')
    expect(code).toBe('P001-01-001')
  })

  it('should increment level-5 code', () => {
    const existing = [{ code: 'P001-01-001', level: 5, parentId: 'parent-2' }]
    const code = generateProjectCode(5, existing, 'parent-2', 'P001-01')
    expect(code).toBe('P001-01-002')
  })

  it('should not mix codes from different parents', () => {
    const existing = [
      { code: 'P001-01', level: 1, parentId: 'parent-1' },
      { code: 'P001-02', level: 1, parentId: 'parent-1' },
      { code: 'P002-01', level: 1, parentId: 'parent-2' },
    ]
    const code = generateProjectCode(1, existing, 'parent-2', 'P002')
    expect(code).toBe('P002-02')
  })
})
