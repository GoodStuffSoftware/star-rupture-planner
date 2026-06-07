<script setup lang="ts">
/**
 * DetailDrawer — single app-level bottom drawer, teleported to body.
 * Driven by store.detail. Slides up from bottom, ~70vh max.
 * Close on ✕ button, Esc, and backdrop click.
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

// ─── Keyboard close (Esc) ─────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.detail) store.closeDetail()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ─── Item detail data ─────────────────────────────────────────────────────
const itemData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'item') return null
  const item = store.itemsById.get(d.id)
  if (!item) return null

  // All producers for this item (from full index)
  const producers = store.fullProducerIndex.get(d.id) ?? []

  // Used-in entries
  const usedIn = store.usedInIndex.get(d.id) ?? []

  // Export entries
  const exports = store.exportsByItem.get(d.id) ?? []

  return { item, producers, usedIn, exports }
})

// ─── Building detail data ─────────────────────────────────────────────────
const buildingData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'building') return null
  const building = store.buildingsById.get(d.id)
  if (!building) return null

  // Tier info — find if this building has a v1 or v2 pair
  const chain = store.chains.find((c) => c.baseId === d.id || c.upgradedId === d.id)
  const isV2 = chain ? chain.upgradedId === d.id : false
  const pairedId = chain ? (isV2 ? chain.baseId : chain.upgradedId) : null
  const pairedBuilding = pairedId ? store.buildingsById.get(pairedId) : null

  // Unlock info
  const unlock = store.buildingUnlock.get(d.id) ?? null

  // Construction cost (if available)
  const costs = store.buildingCosts.get(d.id) ?? null

  return { building, chain, isV2, pairedId, pairedBuilding, unlock, costs }
})

// ─── Type chip colors ─────────────────────────────────────────────────────
const typeColors: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}

// Building type chip colors
const buildingTypeColors: Record<string, string> = {
  production: 'bg-emerald-900/60 text-emerald-300',
  generator: 'bg-amber-900/60 text-amber-300',
  transport: 'bg-blue-900/60 text-blue-300',
  storage: 'bg-purple-900/60 text-purple-300',
  temperature: 'bg-cyan-900/60 text-cyan-300',
  defense: 'bg-red-900/60 text-red-300',
  habitat: 'bg-teal-900/60 text-teal-300',
  core: 'bg-orange-900/60 text-orange-300',
}

// ─── Cross-link helper: navigate to a building and open drawer ────────────
function goBuilding(id: string) {
  store.openBuildingDetail(id)
}

function goItem(id: string) {
  store.openItemDetail(id)
}

function setAsTarget() {
  const d = store.detail
  if (!d || d.kind !== 'item') return
  store.selectTargetItem(d.id)
  store.closeDetail()
}
</script>

<template>
  <Teleport to="body">
    <template v-if="store.detail">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
        @click="store.closeDetail()"
      />

      <!-- Drawer panel -->
      <div
        class="fixed bottom-0 left-0 right-0 z-[160] bg-[var(--panel)] border-t border-[var(--border)] shadow-2xl max-h-[70vh] flex flex-col"
        style="clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)"
      >
        <!-- Drawer header -->
        <div
          class="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0"
        >
          <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            {{ store.detail.kind === 'item' ? 'Item Detail' : 'Building Detail' }}
          </span>
          <button
            class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
            title="Close (Esc)"
            @click="store.closeDetail()"
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

        <!-- Scrollable body -->
        <div class="overflow-y-auto flex-1 px-5 py-4">
          <!-- ═══ ITEM VIEW ═══════════════════════════════════════════════════ -->
          <template v-if="store.detail.kind === 'item' && itemData">
            <!-- Item header -->
            <div class="flex items-center gap-3 mb-4">
              <GameIcon :id="itemData.item.id" kind="item" :name="itemData.item.name" :size="40" />
              <div>
                <h2 class="text-xl font-bold text-[var(--text-strong)]">
                  {{ itemData.item.name }}
                </h2>
                <span
                  :class="typeColors[itemData.item.type] ?? 'bg-slate-700 text-slate-300'"
                  class="text-xs px-2 py-0.5 rounded font-medium"
                >
                  {{ itemData.item.type }}
                </span>
              </div>
              <button
                class="ml-auto px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-on)] text-sm font-semibold clip-chamfer-sm hover:bg-[var(--accent-hover)] transition-colors"
                @click="setAsTarget"
              >
                Set as target
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Made by -->
              <div v-if="itemData.producers.length > 0">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Made by
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="(prod, i) in itemData.producers"
                    :key="prod.building.id + '-' + i"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
                  >
                    <!-- Building link -->
                    <button
                      class="flex items-center gap-2 hover:text-[var(--accent)] transition-colors cursor-pointer mb-2 w-full text-left"
                      @click="goBuilding(prod.building.id)"
                    >
                      <GameIcon
                        :id="prod.building.id"
                        kind="building"
                        :name="prod.building.name"
                        :size="22"
                      />
                      <span class="font-semibold text-[var(--text)]">{{ prod.building.name }}</span>
                    </button>
                    <!-- Recipe inputs → output -->
                    <div class="text-xs text-[var(--muted)] space-y-1">
                      <div
                        v-for="inp in prod.recipe.inputs"
                        :key="inp.id"
                        class="flex items-center gap-1"
                      >
                        <button
                          class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                          @click="goItem(inp.id)"
                        >
                          <GameIcon
                            :id="inp.id"
                            kind="item"
                            :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                            :size="14"
                          />
                          <span>{{ store.itemsById.get(inp.id)?.name ?? inp.id }}</span>
                        </button>
                        <span class="text-[var(--muted-2)]"
                          >{{ fmt(inp.amount_per_minute) }}/min</span
                        >
                      </div>
                      <div
                        v-if="prod.recipe.inputs.length === 0"
                        class="italic text-[var(--muted-2)]"
                      >
                        Extractor (no inputs)
                      </div>
                      <div
                        class="flex items-center gap-1 text-[var(--accent)] mt-1 pt-1 border-t border-[var(--border)]"
                      >
                        <span>→ {{ fmt(prod.recipe.output.amount_per_minute) }}/min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Used in -->
              <div v-if="itemData.usedIn.length > 0">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Used in
                </h3>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="(entry, i) in itemData.usedIn"
                    :key="entry.buildingId + '-' + i"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-1.5 px-2 py-1 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors"
                    @click="goBuilding(entry.buildingId)"
                  >
                    <GameIcon
                      :id="entry.buildingId"
                      kind="building"
                      :name="entry.buildingName"
                      :size="16"
                    />
                    {{ entry.buildingName }}
                    <span class="text-[var(--muted-2)] text-xs"
                      >(→
                      {{
                        store.itemsById.get(entry.recipe.output.id)?.name ?? entry.recipe.output.id
                      }})</span
                    >
                  </button>
                </div>
              </div>
            </div>

            <!-- Exports -->
            <div v-if="itemData.exports.length > 0" class="mt-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Corporation exports
              </h3>
              <div class="space-y-1">
                <div
                  v-for="(exp, i) in itemData.exports"
                  :key="exp.corpId + '-' + exp.level + '-' + i"
                  class="flex items-center gap-3 text-sm"
                >
                  <span class="text-[var(--text)]">{{ exp.corp }}</span>
                  <span class="text-[var(--muted)] text-xs">Lv {{ exp.level }}</span>
                  <span class="text-[var(--accent)] font-mono text-xs">{{ exp.points }} pts</span>
                </div>
              </div>
            </div>
          </template>

          <!-- ═══ BUILDING VIEW ════════════════════════════════════════════════ -->
          <template v-else-if="store.detail.kind === 'building' && buildingData">
            <!-- Building header -->
            <div class="flex items-center gap-3 mb-4">
              <GameIcon
                :id="buildingData.building.id"
                kind="building"
                :name="buildingData.building.name"
                :size="40"
              />
              <div>
                <h2 class="text-xl font-bold text-[var(--text-strong)]">
                  {{ buildingData.building.name }}
                </h2>
                <span
                  :class="
                    buildingTypeColors[buildingData.building.type] ?? 'bg-slate-700 text-slate-300'
                  "
                  class="text-xs px-2 py-0.5 rounded font-medium"
                >
                  {{ buildingData.building.type }}
                </span>
              </div>
            </div>

            <!-- Stats row -->
            <div class="flex items-center gap-4 mb-4 text-sm">
              <span class="flex items-center gap-1 text-amber-400">
                <span>⚡</span> {{ buildingData.building.power ?? 0 }} W
              </span>
              <span class="flex items-center gap-1 text-red-400">
                <span>🔥</span> {{ buildingData.building.heat ?? 0 }}
              </span>
            </div>

            <!-- Tier link (v1 ↔ v2) -->
            <div v-if="buildingData.pairedBuilding" class="mb-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                {{ buildingData.isV2 ? 'Base version (v1)' : 'Upgraded version (v2)' }}
              </h3>
              <button
                class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-3 py-2 hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-sm text-[var(--text)]"
                @click="goBuilding(buildingData.pairedId!)"
              >
                <GameIcon
                  :id="buildingData.pairedId!"
                  kind="building"
                  :name="buildingData.pairedBuilding.name"
                  :size="20"
                />
                {{ buildingData.pairedBuilding.name }}
                <span class="text-[var(--muted)] text-xs ml-1"
                  >({{ buildingData.isV2 ? 'v1' : 'v2' }})</span
                >
              </button>
            </div>

            <!-- Unlocked by -->
            <div v-if="buildingData.unlock" class="mb-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Unlocked by
              </h3>
              <div class="text-sm text-[var(--text)]">
                {{ buildingData.unlock.corp }}
                <span class="text-[var(--muted)] ml-2">Level {{ buildingData.unlock.level }}</span>
              </div>
            </div>

            <!-- Construction cost (data-gated) -->
            <div v-if="buildingData.costs && buildingData.costs.length > 0" class="mb-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Construction cost
              </h3>
              <div class="space-y-1">
                <div
                  v-for="cost in buildingData.costs"
                  :key="cost.id"
                  class="flex items-center gap-2 text-sm"
                >
                  <button
                    class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
                    @click="goItem(cost.id)"
                  >
                    <GameIcon
                      :id="cost.id"
                      kind="item"
                      :name="store.itemsById.get(cost.id)?.name ?? cost.id"
                      :size="16"
                    />
                    <span class="text-[var(--text)]">{{
                      store.itemsById.get(cost.id)?.name ?? cost.id
                    }}</span>
                  </button>
                  <span class="text-[var(--accent)] font-mono">×{{ cost.amount }}</span>
                </div>
              </div>
            </div>

            <!-- Recipes -->
            <div v-if="(buildingData.building.recipes?.length ?? 0) > 0">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Recipes
              </h3>
              <div class="space-y-3">
                <div
                  v-for="(recipe, i) in buildingData.building.recipes"
                  :key="recipe.output.id + '-' + i"
                  class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
                >
                  <!-- Output -->
                  <div class="flex items-center gap-1.5 mb-2">
                    <button
                      class="flex items-center gap-1.5 font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                      @click="goItem(recipe.output.id)"
                    >
                      <GameIcon
                        :id="recipe.output.id"
                        kind="item"
                        :name="store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id"
                        :size="18"
                      />
                      {{ store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id }}
                    </button>
                    <span class="text-[var(--muted)] text-xs ml-1"
                      >{{ fmt(recipe.output.amount_per_minute) }}/min</span
                    >
                  </div>
                  <!-- Inputs -->
                  <div v-if="recipe.inputs.length > 0" class="space-y-1">
                    <div
                      v-for="inp in recipe.inputs"
                      :key="inp.id"
                      class="flex items-center gap-1.5 text-xs text-[var(--muted)]"
                    >
                      <button
                        class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                        @click="goItem(inp.id)"
                      >
                        <GameIcon
                          :id="inp.id"
                          kind="item"
                          :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                          :size="14"
                        />
                        {{ store.itemsById.get(inp.id)?.name ?? inp.id }}
                      </button>
                      <span class="text-[var(--muted-2)]"
                        >{{ fmt(inp.amount_per_minute) }}/min</span
                      >
                    </div>
                  </div>
                  <div v-else class="text-xs text-[var(--muted-2)] italic">
                    No inputs (extractor)
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Fallback if data not found -->
          <template v-else>
            <p class="text-[var(--muted)] italic">
              No data found for this {{ store.detail.kind }}.
            </p>
          </template>
        </div>
      </div>
    </template>
  </Teleport>
</template>
