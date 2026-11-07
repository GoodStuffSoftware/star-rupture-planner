import { describe, it, expect } from 'vitest'
import { trimTransform, ICON_ART_FILL } from './iconTrim'

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

  it('scales the larger ink side to the fill fraction', () => {
    expect(trimTransform({ x0: 0, y0: 0, x1: 256, y1: 256, width: 256, height: 256 }, 0.8)).toBe(
      'scale(0.8) translate(0%, 0%)',
    )
  })

  it('Goethite Ingot: high and slightly right of centre ends up centred at 80% fill', () => {
    // art 198x146 at x 34-232, y 44-190 in 256x256 (top margin 44, bottom 66)
    const t = trimTransform(
      { x0: 34, y0: 44, x1: 232, y1: 190, width: 256, height: 256 },
      ICON_ART_FILL,
    )
    expect(t).toBe('scale(1.0343) translate(-1.953%, 4.297%)')
    // in a 30px box the 198px-wide art becomes ~24px
    expect((198 / 256) * 30 * 1.0343).toBeCloseTo(24, 0)
  })
})
