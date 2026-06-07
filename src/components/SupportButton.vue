<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { getStripeConfig, getStripe } from '../lib/stripe'
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js'

// ─── State ────────────────────────────────────────────────────────────────────
type View = 'menu' | 'checkout' | 'error' | 'success'

const open = ref(false)
const view = ref<View>('menu')
const selectedAmount = ref<number | null>(null)
const customAmount = ref<number>(5)
const errorMsg = ref('')
const checkoutEl = ref<HTMLDivElement | null>(null)

// Stripe config state: populated on modal open
const stripeMode = ref<'test' | 'live'>('test')
const hasPublishableKey = ref(false)

let _checkout: StripeEmbeddedCheckout | null = null

// ─── Success detection on mount ───────────────────────────────────────────────
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('support') === 'success') {
    // Strip params from URL so refresh doesn't re-trigger
    const clean = window.location.pathname
    history.replaceState(null, '', clean)
    open.value = true
    view.value = 'success'
  }
})

// ─── Keyboard close ───────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) closeModal()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  destroyCheckout()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function destroyCheckout() {
  if (_checkout) {
    try {
      _checkout.destroy()
    } catch {
      // ignore if already destroyed
    }
    _checkout = null
  }
}

async function openModal() {
  open.value = true
  view.value = 'menu'
  selectedAmount.value = null
  errorMsg.value = ''
  destroyCheckout()
  // Fetch config eagerly so the badge and no-key state are ready when user picks a tier
  const config = await getStripeConfig()
  stripeMode.value = config.mode
  hasPublishableKey.value = !!config.publishableKey
}

function closeModal() {
  open.value = false
  view.value = 'menu'
  selectedAmount.value = null
  errorMsg.value = ''
  destroyCheckout()
}

function goBack() {
  destroyCheckout()
  view.value = 'menu'
  selectedAmount.value = null
  errorMsg.value = ''
}

// ─── Tier selection + checkout mounting ──────────────────────────────────────
async function selectTier(amount: number) {
  selectedAmount.value = amount
  view.value = 'checkout'
  errorMsg.value = ''

  if (!hasPublishableKey.value) {
    // No key — graceful placeholder, nothing to mount
    return
  }

  // Wait for the checkout container to be in the DOM
  await nextTick()

  const stripe = await getStripe()
  if (!stripe) {
    errorMsg.value = "Couldn't start checkout — try the live site."
    return
  }

  const fetchClientSecret = async (): Promise<string> => {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as { clientSecret?: string; error?: string }
    if (!data.clientSecret) throw new Error(data.error ?? 'no_client_secret')
    return data.clientSecret
  }

  try {
    _checkout = await stripe.createEmbeddedCheckoutPage({ fetchClientSecret })
    if (checkoutEl.value) {
      _checkout.mount(checkoutEl.value)
    }
  } catch (err) {
    console.error('[SupportButton] Embedded checkout error:', err)
    errorMsg.value = "Couldn't start checkout — try the live site."
  }
}

function handleCustom() {
  const amt = Number(customAmount.value)
  if (!isFinite(amt) || amt < 1) return
  selectTier(Math.min(amt, 500))
}
</script>

<template>
  <!-- ── Trigger button ──────────────────────────────────────────────────────── -->
  <button
    class="chamfer-sm flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
    title="Buy us a coffee"
    @click="openModal"
  >
    <span>☕</span>
    <span>Buy us a coffee</span>
  </button>

  <!-- ── Modal (teleported to body) ─────────────────────────────────────────── -->
  <Teleport to="body">
    <template v-if="open">
      <!-- Backdrop -->
      <div class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" @click="closeModal" />

      <!-- Panel -->
      <div class="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
        <div
          class="chamfer [--cf-fill:var(--panel)] w-full max-w-md pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Buy us a coffee"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-bold text-[var(--text-strong)]">Buy us a coffee</h2>
                <!-- Test mode badge — only shown when mode === 'test' -->
                <span
                  v-if="stripeMode === 'test'"
                  class="chamfer-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style="
                    background: color-mix(in srgb, var(--muted) 15%, transparent);
                    color: var(--muted);
                    border: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
                  "
                >
                  Test mode
                </span>
              </div>
              <p class="text-xs text-[var(--muted)] mt-0.5">That was some Good Stuff.</p>
            </div>
            <button
              class="w-7 h-7 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
              style="
                clip-path: polygon(
                  4px 0,
                  100% 0,
                  100% calc(100% - 4px),
                  calc(100% - 4px) 100%,
                  0 100%,
                  0 4px
                );
              "
              title="Close (Esc)"
              @click="closeModal"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-4">
            <!-- ── MENU view ──────────────────────────────────────────────── -->
            <template v-if="view === 'menu'">
              <p class="text-sm text-[var(--muted)] mb-4">
                Pick a tier — every coffee helps keep the lights on.
              </p>

              <div class="flex flex-col gap-2">
                <!-- Fixed tiers -->
                <button
                  class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] hover:[--cf-border:var(--accent)] flex items-center justify-between px-4 py-3 text-sm text-[var(--text)] transition-colors text-left"
                  @click="selectTier(1.5)"
                >
                  <span class="font-medium">☕ Cheap ass Coffee</span>
                  <span class="text-[var(--accent)] font-semibold tabular-nums">$1.50</span>
                </button>

                <button
                  class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] hover:[--cf-border:var(--accent)] flex items-center justify-between px-4 py-3 text-sm text-[var(--text)] transition-colors text-left"
                  @click="selectTier(3)"
                >
                  <span class="font-medium">🥛 Maybe some cream or sugar too</span>
                  <span class="text-[var(--accent)] font-semibold tabular-nums">$3</span>
                </button>

                <button
                  class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] hover:[--cf-border:var(--accent)] flex items-center justify-between px-4 py-3 text-sm text-[var(--text)] transition-colors text-left"
                  @click="selectTier(5)"
                >
                  <span class="font-medium">✨ Latte with cold foam</span>
                  <span class="text-[var(--accent)] font-semibold tabular-nums">$5</span>
                </button>

                <!-- Name your price -->
                <div class="chamfer-sm [--cf-fill:var(--panel-2)] px-4 py-3">
                  <p class="text-sm font-medium text-[var(--text)] mb-2">💸 Name your price</p>
                  <div class="flex items-center gap-2">
                    <span class="text-[var(--muted)] text-sm">$</span>
                    <input
                      v-model.number="customAmount"
                      type="number"
                      min="1"
                      max="500"
                      step="1"
                      class="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-3 py-1.5 outline-none focus:border-[var(--accent)] transition-colors"
                      style="
                        clip-path: polygon(
                          4px 0,
                          100% 0,
                          100% calc(100% - 4px),
                          calc(100% - 4px) 100%,
                          0 100%,
                          0 4px
                        );
                      "
                      placeholder="5"
                    />
                    <button
                      class="chamfer-sm [--cf-fill:var(--accent)] hover:[--cf-fill:var(--accent-hover)] px-4 py-1.5 text-sm font-semibold text-[var(--accent-on)] transition-colors shrink-0"
                      @click="handleCustom"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── CHECKOUT view ──────────────────────────────────────────── -->
            <template v-else-if="view === 'checkout'">
              <!-- Back control -->
              <button
                class="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors mb-4"
                @click="goBack"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to menu
              </button>

              <!-- Error state -->
              <template v-if="errorMsg">
                <div class="chamfer-sm [--cf-fill:var(--panel-2)] px-4 py-5 text-center">
                  <p class="text-[var(--muted)] text-sm">
                    {{ errorMsg }}
                  </p>
                </div>
              </template>

              <!-- No-key graceful placeholder -->
              <template v-else-if="!hasPublishableKey">
                <div class="chamfer-sm [--cf-fill:var(--panel-2)] px-4 py-8 text-center">
                  <div class="text-4xl mb-3">☕</div>
                  <p class="text-sm text-[var(--muted)] leading-relaxed">
                    Checkout appears here once Stripe keys are added ☕
                  </p>
                </div>
              </template>

              <!-- Stripe Embedded Checkout mount point -->
              <template v-else>
                <div ref="checkoutEl" class="min-h-[200px]" />
              </template>
            </template>

            <!-- ── SUCCESS view ────────────────────────────────────────────── -->
            <template v-else-if="view === 'success'">
              <div class="text-center py-6">
                <div class="text-5xl mb-4">☕</div>
                <h3 class="text-xl font-bold text-[var(--text-strong)] mb-2">
                  That was some Good Stuff.
                </h3>
                <p class="text-sm text-[var(--muted)] mb-6">Thanks for the support!</p>
                <button
                  class="chamfer-sm [--cf-fill:var(--accent)] hover:[--cf-fill:var(--accent-hover)] px-6 py-2 text-sm font-semibold text-[var(--accent-on)] transition-colors"
                  @click="closeModal"
                >
                  Close
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>
