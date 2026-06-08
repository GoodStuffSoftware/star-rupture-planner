/**
 * Cloudflare Pages Function: POST /api/create-checkout-session
 *
 * Env vars (set per-environment in the Pages project → Variables and Secrets;
 * Preview = test keys, Production = live keys; also .dev.vars for local wrangler):
 *   STRIPE_SECRET_KEY      — sk_test_... or sk_live_... (add as a Secret / encrypted)
 *   STRIPE_PUBLISHABLE_KEY — pk_test_... or pk_live_... (used by /api/stripe-config)
 *
 * Test vs live is decided by which environment is deployed — there is no mode flag.
 *
 * Accepts JSON body: { amount: number } in US dollars (min $1.00, max $500.00).
 * Returns JSON: { clientSecret: string } on success.
 * Uses the Stripe REST API directly via fetch — no stripe npm SDK needed.
 */

interface Env {
  STRIPE_SECRET_KEY?: string
}

interface RequestBody {
  amount: unknown
}

interface StripeSession {
  client_secret: string
}

interface StripeError {
  error: {
    message: string
    type: string
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // ── 1. Guard: Stripe must be configured ─────────────────────────────────
  // The active key (test or live) comes from this deployment's environment.
  const secret = env.STRIPE_SECRET_KEY
  if (!secret) {
    return new Response(JSON.stringify({ error: 'stripe_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 2. Parse + validate request body ────────────────────────────────────
  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const amount = body.amount
  if (
    typeof amount !== 'number' ||
    !isFinite(amount) ||
    amount < 1.0 ||
    amount > 500.0
  ) {
    return new Response(
      JSON.stringify({ error: 'invalid_amount', detail: 'Amount must be between $1.00 and $500.00' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const cents = Math.round(amount * 100)

  // ── 3. Derive return URL (keep {CHECKOUT_SESSION_ID} literal for Stripe) ─
  const origin = new URL(request.url).origin
  const returnUrl = `${origin}/?support=success&session_id={CHECKOUT_SESSION_ID}`

  // ── 4. Build form-encoded body for Stripe REST API ───────────────────────
  const params = new URLSearchParams()
  params.set('ui_mode', 'embedded_page')
  params.set('mode', 'payment')
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][product_data][name]', 'Star Rupture Planner — coffee')
  params.set('line_items[0][price_data][unit_amount]', String(cents))
  params.set('line_items[0][quantity]', '1')
  params.set('return_url', returnUrl)

  // ── 5. Call Stripe ────────────────────────────────────────────────────────
  let stripeRes: Response
  try {
    stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
  } catch (err) {
    console.error('[create-checkout-session] fetch error:', err)
    return new Response(JSON.stringify({ error: 'stripe_fetch_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!stripeRes.ok) {
    const errBody = (await stripeRes.json()) as StripeError
    // Log the detail server-side only — never leak the key or raw Stripe error to the client
    console.error('[create-checkout-session] Stripe error:', errBody?.error?.message)
    return new Response(JSON.stringify({ error: 'stripe_error', detail: errBody?.error?.type ?? 'unknown' }), {
      status: stripeRes.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const session = (await stripeRes.json()) as StripeSession
  return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
