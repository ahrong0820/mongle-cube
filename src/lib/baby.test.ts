import { describe, expect, it } from 'vitest'
import { getBabyAgeDays, getInclusiveDayNumber, getWeaningDay } from './baby'

describe('baby timeline helpers', () => {
  it('counts the starting date as day one', () => {
    expect(getInclusiveDayNumber('2026-01-01', '2026-01-01')).toBe(1)
    expect(getInclusiveDayNumber('2026-01-02', '2026-01-01')).toBe(2)
  })

  it('counts calendar days safely across leap day', () => {
    expect(getInclusiveDayNumber('2028-03-01', '2028-02-28')).toBe(3)
  })

  it('returns null before a timeline starts or for invalid input', () => {
    expect(getInclusiveDayNumber('2026-01-01', '2026-01-02')).toBeNull()
    expect(getInclusiveDayNumber('2026-02-30', '2026-01-01')).toBeNull()
  })

  it('derives baby age and weaning day independently', () => {
    const profile = { birthDate: '2026-01-01', weaningStartedOn: '2026-06-19' }
    expect(getBabyAgeDays('2026-06-19', profile)).toBe(170)
    expect(getWeaningDay('2026-06-19', profile)).toBe(1)
  })
})
