/**
 * Stripe singleton loader.
 *
 * Config is fetched at runtime from /api/stripe-config (Cloudflare function env vars).
 * No VITE_ build vars are used — all Stripe config lives server-side.
 *
 * getStripeConfig(): memoized fetch of { mode, publishableKey }. On failure resolves
 *   to { mode: 'test', publishableKey: null } so vite preview / offline still works.
 * getStripe(): awaits config; returns memoized loadStripe promise or null if no key.
 */
import { loadStripe, type Stripe } from '@stripe/stripe-js'

export interface StripeConfig {
  mode: 'test' | 'live'
  publishableKey: string | null
}

let _configPromise: Promise<StripeConfig> | null = null

/** Fetch Stripe config once from /api/stripe-config; memoized. Never throws. */
export function getStripeConfig(): Promise<StripeConfig> {
  if (!_configPromise) {
    _configPromise = fetch('/api/stripe-config')
      .then(async (res) => {
        if (!res.ok) throw new Error(`stripe-config HTTP ${res.status}`)
        const data = (await res.json()) as StripeConfig
        return data
      })
      .catch(() => {
        // Fail-soft: functions not running (plain vite preview) or network error.
        return { mode: 'test' as const, publishableKey: null }
      })
  }
  return _configPromise
}

let _stripePromise: Promise<Stripe | null> | null = null

/** Returns a memoized loadStripe() promise, or null if no publishable key is configured. */
export async function getStripe(): Promise<Stripe | null> {
  const config = await getStripeConfig()
  if (!config.publishableKey) return null
  if (!_stripePromise) {
    _stripePromise = loadStripe(config.publishableKey)
  }
  return _stripePromise
}
