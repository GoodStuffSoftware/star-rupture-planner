/**
 * Cloudflare Pages Function: GET /api/stripe-config
 *
 * Returns the active Stripe publishable key for the frontend, plus a derived
 * mode ("test"/"live") that is used only to show a "Test mode" badge in the UI.
 * Only ever exposes the publishable key (pk_...) — never the secret key.
 *
 * The key comes from this deployment's environment (Preview = test keys,
 * Production = live keys), so test vs live needs no separate flag — it is
 * derived from the pk_test_ / pk_live_ prefix.
 */

interface Env {
  STRIPE_PUBLISHABLE_KEY?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const publishableKey = env.STRIPE_PUBLISHABLE_KEY ?? null
  const mode: 'test' | 'live' = publishableKey?.startsWith('pk_live_') ? 'live' : 'test'

  return new Response(JSON.stringify({ mode, publishableKey }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
