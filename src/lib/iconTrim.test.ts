import { describe, it, expect } from 'vitest'
import { trimTransform } from './iconTrim'

describe('trimTransform', () => {
  it('leaves a full-bleed image alone', () => {
    expect(trimTransform({ x0: 0, y0: 0, x1: 256, y1: 256, width: 256, height: 256 })).toBe(
      'scale(1) translate(0%, 0%)',
    )
  })

  it('scales by the larger ink side and re-centres', () => {
    // ink 144 x 165, centre (133, 118.5) in a 256 image
    const t = trimTransform({ x0: 61, y0: 36, x1: 205, y1: 201, width: 256, height: 256 })
    expect(t).toBe('scale(1.5515) translate(-1.953%, 3.711%)')
  })

  it('returns null for empty art', () => {
    expect(trimTransform({ x0: 5, y0: 5, x1: 5, y1: 5, width: 256, height: 256 })).toBeNull()
  })
})
