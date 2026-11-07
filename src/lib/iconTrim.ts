/** Alpha bounding box of an icon's visible art, in natural-image pixels (x1/y1 exclusive). */
export interface InkBox {
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  height: number
}

const ALPHA_THRESHOLD = 16

/**
 * CSS transform (transform-origin: centre) that centres the art in its box and scales it so its
 * larger side fills the box. Null when the box is empty.
 */
export function trimTransform(b: InkBox): string | null {
  const iw = b.x1 - b.x0
  const ih = b.y1 - b.y0
  const larger = Math.max(iw, ih)
  if (larger <= 0 || b.width <= 0 || b.height <= 0) return null
  const s = Math.min(b.width, b.height) / larger
  const tx = ((b.width / 2 - (b.x0 + b.x1) / 2) / b.width) * 100
  const ty = ((b.height / 2 - (b.y0 + b.y1) / 2) / b.height) * 100
  return `scale(${+s.toFixed(4)}) translate(${+tx.toFixed(3)}%, ${+ty.toFixed(3)}%)`
}

const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

/** Already-measured transform for a src (undefined = not measured yet). */
export function cachedTrim(src: string): string | null | undefined {
  return cache.get(src)
}

/** Measure an icon's art once per src. Resolves null on any failure (caller renders untrimmed). */
export function loadTrim(src: string): Promise<string | null> {
  const hit = cache.get(src)
  if (hit !== undefined) return Promise.resolve(hit)
  let p = pending.get(src)
  if (!p) {
    p = measure(src).then((t) => {
      cache.set(src, t)
      pending.delete(src)
      return t
    })
    pending.set(src, p)
  }
  return p
}

function measure(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const w = img.naturalWidth
          const h = img.naturalHeight
          if (!w || !h) return resolve(null)
          const c = document.createElement('canvas')
          c.width = w
          c.height = h
          const ctx = c.getContext('2d', { willReadFrequently: true })
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0)
          const d = ctx.getImageData(0, 0, w, h).data
          let x0 = w
          let y0 = h
          let x1 = 0
          let y1 = 0
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (d[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
                if (x < x0) x0 = x
                if (x + 1 > x1) x1 = x + 1
                if (y < y0) y0 = y
                if (y + 1 > y1) y1 = y + 1
              }
            }
          }
          if (x1 <= x0 || y1 <= y0) return resolve(null)
          resolve(trimTransform({ x0, y0, x1, y1, width: w, height: h }))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch {
      resolve(null)
    }
  })
}
