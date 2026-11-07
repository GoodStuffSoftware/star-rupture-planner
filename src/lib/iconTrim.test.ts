import { describe, it, expect } from 'vitest'
import { trimTransform, inkAspect, heightFit, ICON_ART_FILL } from './iconTrim'

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

  it('defaults to filling the box', () => {
    expect(ICON_ART_FILL).toBe(1)
  })

  it('Goethite Ingot: high and slightly right of centre ends up centred at the default (full) fill', () => {
    // art 198x146 at x 34-232, y 44-190 in 256x256 (top margin 44, bottom 66)
    const t = trimTransform(
      { x0: 34, y0: 44, x1: 232, y1: 190, width: 256, height: 256 },
      ICON_ART_FILL,
    )
    expect(t).toBe('scale(1.2929) translate(-1.953%, 4.297%)')
    // in a 30px box the 198px-wide art becomes ~30px, filling the box
    expect((198 / 256) * 30 * 1.2929).toBeCloseTo(30, 0)
  })
})

describe('height fit (tab chips)', () => {
  // Goethite Ingot: art 198x146 at x 34-232, y 44-190 in 256x256
  const goethite = { x0: 34, y0: 44, x1: 232, y1: 190, width: 256, height: 256 }

  it('aspect is the art width over its height', () => {
    expect(inkAspect(goethite)).toBe(1.3562)
    expect(inkAspect({ x0: 0, y0: 0, x1: 100, y1: 100, width: 256, height: 256 })).toBe(1)
    expect(inkAspect({ x0: 5, y0: 5, x1: 5, y1: 5, width: 256, height: 256 })).toBeNull()
  })

  it('scales the image so the art height fills the box and the art centre is the box centre', () => {
    // 256 / 146 = 175.342% of the box height; art centre (133, 117)
    expect(heightFit(goethite)).toEqual({ heightPct: 175.342, tx: -51.953, ty: -45.703 })
  })

  it('is null for empty art', () => {
    expect(heightFit({ x0: 5, y0: 5, x1: 5, y1: 5, width: 256, height: 256 })).toBeNull()
  })
})
