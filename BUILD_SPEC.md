# Star Rupture Planner — Build Spec

A Vue 3 crafting-tree planner for the game **Star Rupture**. Pick a target item + desired
throughput, and the app shows the full crafting chain as a collapsible tree, with the building
that makes each item, how many buildings are needed, and the per-minute rates. A tier selector
lets the user choose which building versions (v1/v2) they have, so the calculator uses the
correct recipes.

## Stack (already scaffolded)
- Vite + Vue 3 (`<script setup lang="ts">`) + TypeScript
- Pinia (already wired in `src/main.ts`)
- Tailwind CSS v4 (`@import "tailwindcss";` already in `src/style.css`; no tailwind.config needed)
- Data already downloaded to `public/game-data/{version}/{file}.json`

## Data (source: flexsurfer/starrupture-planner, MIT)
Served as static assets, fetched at runtime from `/game-data/{version}/...`.

Versions (newest last): `playtest`, `earlyaccess`, `update1_PTB`, `update1` (DEFAULT).

Three files per version:

### `buildings_and_recipes.json` — array of buildings
```jsonc
{
  "id": "assembler",            // snake_case unique id
  "name": "Assembler",          // display name
  "type": "production",         // one of: production | generator | transport | storage |
                                //         temperature | defense | habitat | core
  "power": 60,                  // power (W). Consumers positive. Generators don't appear as item producers.
  "heat": 150,                  // heat output
  "upgrade": "craftertier2",    // OPTIONAL — id of this building's v2/upgraded form. Absent if none.
  "recipes": [                  // may be empty (non-production buildings)
    {
      "output": { "id": "accumulator", "amount_per_minute": 12 },
      "inputs": [               // EMPTY array for extractors (ore_excavator etc.) -> natural leaf
        { "id": "electronics", "amount_per_minute": 24 },
        { "id": "stator",      "amount_per_minute": 12 },
        { "id": "battery",     "amount_per_minute": 12 }
      ]
    }
  ]
}
```

### `items_catalog.json` — array of items
```jsonc
{ "id": "accumulator", "name": "Accumulator", "type": "component" }
// type: raw | processed | component | material | ammo
```

### `corporations_components.json` — object keyed by corp display name (NOT used in v1 of this app; ignore).

### Upgrade chains in update1 (base id -> upgraded id)
Production chains (these change recipes — drive the tier selector from data, do not hardcode):
`fabricator→craftertier2`, `factory→factorytier2`, `furnace→furnacetier2`,
`ore_excavator→mechanicaldrilltier2`, `compounder→synthetizertier2`,
`orbital_cargo_launcher→exportertier2`.
Non-production chains (no recipes; tier toggle has no calc effect — DO NOT show in tier selector):
`base_core_amplifier_v1→v2`, `turret_v1→v2`, `solar_generator_v1→v2`, `wind_turbine_v1→v2`,
`storage_depot_v1→v2`.

> Note: every item (including raw ores) has a producing recipe; ores are produced by extractor
> buildings whose recipe `inputs` array is empty. There are zero orphan ids. Recursion terminates
> naturally at recipes with no inputs.

---

## File structure to build
```
src/
  types/game.ts            # data + resolved-tree types
  data/versions.ts         # version list + labels
  data/loader.ts           # fetch + parse the 3 files for a version
  lib/recipeIndex.ts       # available-building filtering by tier + producer index
  lib/resolver.ts          # resolveTree() + aggregateTotals()
  stores/plannerStore.ts   # pinia store: state + computed tree/totals
  components/
    VersionSelector.vue
    TargetSelector.vue     # item search + rate input
    TierSelector.vue       # v1/v2 toggles for production upgrade chains
    CraftTree.vue          # renders root node + handles empty/error states
    CraftTreeNode.vue      # RECURSIVE collapsible node
    TotalsPanel.vue        # raw materials, building counts, total power/heat
  App.vue                  # layout shell wiring the above
```

## Types (`src/types/game.ts`)
```ts
export type ItemType = 'raw' | 'processed' | 'component' | 'material' | 'ammo'
export type BuildingType = 'production' | 'generator' | 'transport' | 'storage'
  | 'temperature' | 'defense' | 'habitat' | 'core'

export interface Item { id: string; name: string; type: ItemType }
export interface RecipePort { id: string; amount_per_minute: number }
export interface Recipe { output: RecipePort; inputs: RecipePort[] }
export interface Building {
  id: string; name: string; type: BuildingType
  power?: number; heat?: number; upgrade?: string
  recipes?: Recipe[]
}

export interface UpgradeChain { baseId: string; upgradedId: string; isProduction: boolean }

// Resolved crafting-tree node
export interface CraftNode {
  itemId: string
  itemName: string
  itemType: ItemType
  ratePerMin: number              // required output rate of this item at this node
  building?: Building             // producer chosen for this item (undefined if none)
  recipe?: Recipe
  buildingsNeeded?: number        // exact fractional count = ratePerMin / output.amount_per_minute
  isRaw: boolean                  // true if leaf: no producer OR recipe has no inputs
  isCycle: boolean                // true if this item already appeared in its own ancestry
  children: CraftNode[]
}

export interface Totals {
  rawMaterials: { itemId: string; itemName: string; ratePerMin: number }[]   // aggregated leaves
  buildings: { buildingId: string; buildingName: string; count: number; ceilCount: number }[]
  totalPower: number              // sum buildingsNeeded * (building.power ?? 0)
  totalHeat: number               // sum buildingsNeeded * (building.heat ?? 0)
}
```

## Data loader (`src/data/loader.ts`)
`loadGameData(version: string): Promise<{ buildings: Building[]; items: Item[] }>`
- `fetch('/game-data/' + version + '/buildings_and_recipes.json')` and the items file; parse JSON.
- Throw a readable error if a fetch fails.
- Compute `UpgradeChain[]` from buildings (each building with an `upgrade` field). `isProduction` =
  base building has non-empty `recipes` OR upgraded building has non-empty recipes. Export a helper
  `deriveUpgradeChains(buildings): UpgradeChain[]`.

## Recipe index (`src/lib/recipeIndex.ts`)
- `type TierSelection = Record<string /*chain baseId*/, 'v1' | 'v2'>`
- `getAvailableBuildings(buildings, chains, tier): Building[]`
  - Owning v2 does NOT remove your v1 buildings (in-game v2 is an additional unlock, and v2
    buildings don't carry every v1 recipe). For each production chain (`isProduction` only):
    - if `tier[baseId] === 'v2'` → keep BOTH base and upgraded available.
    - else (default 'v1') → keep the base, drop the upgraded building.
  - Non-production chains: leave both buildings in (their tier doesn't matter for recipes).
- `buildProducerIndex(availableBuildings, upgradedIds): Map<string, {building, recipe}[]>`
  - For every available building with recipes, index each recipe under `recipe.output.id`.
  - Rank each producer list so the first entry is preferred: v2 (id in `upgradedIds`) first,
    then production-type buildings. This makes an item makeable by both tiers prefer the v2
    recipe while still falling back to v1 for items v2 cannot make.
- `pickProducer(itemId, index): {building, recipe} | undefined`
  - Return the first (pre-ranked) producer, or undefined if none.

## Resolver (`src/lib/resolver.ts`) — THE CORE. Implement exactly.
```
resolveTree(itemId, ratePerMin, itemsById, producerIndex):
  return _resolve(itemId, ratePerMin, ancestry = new Set(), depth = 0)

_resolve(itemId, ratePerMin, ancestry, depth):
  item = itemsById.get(itemId)
  node = { itemId, itemName: item?.name ?? itemId, itemType: item?.type ?? 'component',
           ratePerMin, isRaw: false, isCycle: false, children: [] }

  producer = pickProducer(itemId, producerIndex)
  if !producer:
      node.isRaw = true; return node                     // no recipe -> raw leaf

  node.building = producer.building
  node.recipe   = producer.recipe
  outRate = producer.recipe.output.amount_per_minute
  node.buildingsNeeded = outRate > 0 ? ratePerMin / outRate : 0

  if producer.recipe.inputs.length === 0:
      node.isRaw = true; return node                     // extractor -> leaf

  if ancestry.has(itemId) || depth > 50:
      node.isCycle = true; return node                   // guard: stop, do not recurse

  nextAncestry = new Set(ancestry); nextAncestry.add(itemId)
  for input in producer.recipe.inputs:
      childRate = node.buildingsNeeded * input.amount_per_minute
      node.children.push(_resolve(input.id, childRate, nextAncestry, depth + 1))
  return node
```
`aggregateTotals(root): Totals` — walk the whole tree once:
- rawMaterials: for every node where `isRaw` is true, accumulate `ratePerMin` keyed by itemId.
- buildings: for every node with a `building` and `buildingsNeeded`, accumulate `buildingsNeeded`
  keyed by buildingId. `ceilCount = Math.ceil(count)`.
- totalPower / totalHeat: sum `buildingsNeeded * (building.power|heat ?? 0)` over those nodes.
- Sort rawMaterials by ratePerMin desc; buildings by count desc.

## Store (`src/stores/plannerStore.ts`) — Pinia setup store
State (refs): `version` (default `'update1'`), `buildings`, `items`, `chains`, `loading`, `error`,
`tier` (TierSelection, default all production chains → `'v1'`), `targetItemId`, `targetRate`
(default 60).
Derived (computed):
- `itemsById` Map, `buildingsById` Map
- `availableBuildings` → `producerIndex` (recompute when version/tier change)
- `tree` = `targetItemId ? resolveTree(...) : null`
- `totals` = `tree ? aggregateTotals(tree) : null`
- `productionChains` = chains.filter(isProduction) — drives the TierSelector
Actions:
- `load(version)`: set loading, `loadGameData`, populate buildings/items/chains, reset `tier` to all
  'v1' for production chains, default `targetItemId` to the first item of type `'component'` (or first
  item), clear loading. Call once on app mount and whenever the version changes.
- `setTier(baseId, value)`, `setVersion(v)` (reloads), `setTarget(itemId, rate)`.

## Components & UI
Dark theme (`bg-slate-900`/`slate-800` panels, `slate-100` text, accent `cyan-400`/`emerald-400`).
Layout in `App.vue`: a header bar (title "Star Rupture Planner" + VersionSelector + TargetSelector),
then a two-column main area: left = CraftTree (flex-1, scrollable), right = sticky sidebar with
TierSelector (top) and TotalsPanel (below). Responsive: stack to one column under `lg`.

- **VersionSelector**: `<select>` of versions (label-cased: "Update 1", "Update 1 PTB", "Early Access",
  "Playtest"); on change calls `setVersion`.
- **TargetSelector**: a text `<input>` filtering a datalist/dropdown of all items by name (show item
  type as a small chip), plus a number `<input>` for rate (/min, min 0, step any). Updates store on change.
- **TierSelector**: card titled "Buildings you have". One row per production chain: building base name
  (e.g. "Fabricator") with a v1/v2 segmented toggle (two buttons). Shows the upgraded building's name
  on the v2 button if helpful. A small "All v1 / All v2" pair of buttons at top for convenience.
- **CraftTree**: if no target → empty hint. If loading → spinner text. If error → error text. Else
  render root `CraftTreeNode`. Show a one-line header: "<rate>/min <ItemName>".
- **CraftTreeNode** (recursive): a row showing, left-to-right:
  - a disclosure caret (only if `children.length`); click toggles `expanded` (default expanded for the
    first ~2 depths, collapsed deeper — accept a `depth` prop and default `expanded = depth < 2`).
  - item name (bold), a small type chip colored by itemType.
  - the producer: "<buildingsNeeded rounded to 0.01>× <BuildingName>" (e.g. "2.5× Assembler"); if
    `isRaw` show a "raw" badge and no building (or the extractor name if present). If `isCycle` show a
    "↻ cycle" badge and stop.
  - the rate: "<ratePerMin formatted>/min" right-aligned, muted.
  - indent children by depth (border-left guide). Recurse `<CraftTreeNode :node="child" :depth="depth+1">`.
- **TotalsPanel**: three sections — "Raw materials/min" (item name + rate), "Buildings"
  (name + "×N" using ceilCount, with exact in parens), "Power: N W / Heat: N". Numbers formatted.

### Formatting helper (put in `src/lib/format.ts` or inline)
`fmt(n)`: if integer show as-is, else up to 2 decimals, strip trailing zeros, group thousands.
Building count: show 2 decimals (e.g. `2.5`, `1`, `0.33`).

## Acceptance criteria
1. `npm run build` passes (no TS errors) and `npm run dev` serves the app.
2. Selecting an item + rate renders a collapsible tree to raw materials; carets expand/collapse.
3. Changing a tier toggle (e.g. Fabricator v1→v2) changes the recipe/rates used downstream.
4. Changing the game version reloads data and rebuilds everything.
5. Totals panel shows aggregated raw materials, building counts, and total power/heat.
6. No console errors; no infinite recursion on any item.

---

# v2 FEATURES (this iteration)

Four additions: (A) per-node building-version override, (B) machine icons (version-dependent),
(C) a "show extractors" toggle, (D) the "Buildings you have" card becomes a collapsible **Options**
panel at the top with summary chips when collapsed.

## A. Per-node version override (scope = per ITEM)

Choosing a version at a node applies to that item everywhere it appears (kept consistent). The
global Options panel sets the default per tiered building; per-node picks override the default for
that specific item, and may select ANY producing building (even a version not globally "owned").

### Types (`src/types/game.ts`) additions
```ts
export type VersionOverrides = Record<string /*itemId*/, string /*buildingId*/>
// CraftNode gains:
//   candidates?: { buildingId: string; buildingName: string }[]  // all buildings that produce this item (>1 ⇒ show a picker)
//   isOverridden?: boolean                                        // producer came from an override, not the global default
```

### Recipe index (`src/lib/recipeIndex.ts`)
- Reuse `buildProducerIndex` over ALL buildings to get a **full** index (`fullProducerIndex`). The
  existing tier-aware `producerIndex` (available buildings) remains the global default source.
- Add `getCandidates(itemId, fullIndex): {buildingId, buildingName}[]` = the producing buildings for
  that item (dedup by buildingId), ranked v2-first. Used to populate the per-node picker.

### Resolver (`src/lib/resolver.ts`) — change producer selection only
Pass a context object instead of loose args:
`resolveTree(targetItemId, rate, { itemsById, producerIndex, fullProducerIndex, overrides })`.
In `_resolve`, choose the producer as:
```
let producer
const ovId = overrides[itemId]
if (ovId) producer = fullProducerIndex.get(itemId)?.find(e => e.building.id === ovId)
if (!producer) producer = pickProducer(itemId, producerIndex)   // global default (tier-aware)
node.isOverridden = !!(ovId && producer && producer.building.id === ovId)
```
Then set `node.candidates = getCandidates(itemId, fullProducerIndex)` (so the node knows its options).
Everything else (rate math, cycle/depth guard, extractor leaf) is unchanged. Overrides do NOT change
the cycle guard or recursion shape — only which recipe is used at that item.

## B. Machine + item icons (version-dependent)
Icons are bundled as **WebP**, keyed DIRECTLY by id (no mapping table) — so v1 vs v2 (different
building ids) get distinct art automatically:
- Buildings: `public/icons/buildings/<buildingId>.webp` (43/44 ids; only `zipline` has NO icon).
- Items: `public/icons/items/<itemId>.webp` (all 104 update1 items covered).
- Upstream source pattern (used by the bundling script, NOT at runtime):
  `https://raw.githubusercontent.com/flexsurfer/starrupture-planner/main/assets/icons/{buildings|items}/<id>.webp`
- Build ONE reusable `src/components/GameIcon.vue` (props: `kind: 'building' | 'item'`, `id`, `name`,
  `size?` default 20). It renders `<img src="/icons/<kind>s/<id>.webp">` and, on `@error` (e.g. the
  missing `zipline`) OR when `store.showIcons` is false → does NOT show a broken image. When showIcons
  is off it renders nothing (or a tiny spacer); on `@error` it renders a fallback glyph: a rounded
  `bg-slate-700` tile with the name's first 1–2 letters. `loading="lazy"` and fixed width/height to
  avoid layout shift.
- Use it: item icon before the item name in each tree node; building icon before the producer name in
  tree nodes and in the Options "Building versions" rows. Sizes ~20px in rows.

## C. Show-extractors toggle (display + totals; resolver unchanged)
`showExtractors` (default **false**). Extractor nodes are the `isRaw` nodes that DO have a `building`
(their recipe has no inputs — e.g. Ore Excavator → Titanium Ore). True raw nodes with no producer
stay plain leaves always.
- `aggregateTotals(root, { showExtractors })`: when accumulating the **buildings** list, include a
  node's building when `building && buildingsNeeded && (!node.isRaw || showExtractors)`. (So extractor
  buildings appear in Buildings totals + totalPower/heat only when the toggle is on.) `rawMaterials`
  aggregation is unchanged (always lists raw item rates).
- `CraftTreeNode`: for an `isRaw` node, if `showExtractors && node.building`, render the extractor like
  a normal producer (`"3× Ore Excavator"` + icon + version picker if it has candidates); otherwise
  render the current plain `raw` badge.

## D. Options panel (`src/components/OptionsPanel.vue`) — replaces TierSelector
A full-width collapsible card placed at the TOP of `main`, ABOVE the tree/sidebar area.
- **Header row**: caret + "Options" title + (when collapsed) inline summary chips, e.g.
  `Fabricator v2`, `Furnace v2` (only buildings set to v2), `Extractors` (if shown), `Icons off`
  (if disabled), and `N overrides` (if any per-node overrides set). If everything is default, show a
  muted `All defaults` chip. Clicking the header toggles `optionsCollapsed`.
- **Expanded body**, two subsections:
  - **Building versions** (the global default selections): one row per production chain — building
    name + a v1/v2 segmented toggle, with a `BuildingIcon` for the selected version. `All v1 / All v2`
    convenience buttons. If the version has no upgradeable buildings (e.g. earlyaccess) show the
    existing "No upgradeable buildings" message.
  - **Display**: toggle switches for `Show extractors` and `Show machine icons`. Optional: a `Reset
    node overrides` button (clears `overrides`), shown only when overrides exist.
- Default `optionsCollapsed = false` (expanded on first load). Two-column main layout below it is
  otherwise unchanged (tree left, TotalsPanel right).

## Store additions (`src/stores/plannerStore.ts`)
- State: `overrides` (VersionOverrides, default `{}`), `showExtractors` (false), `showIcons` (true),
  `optionsCollapsed` (false).
- Computed: `fullProducerIndex` (from ALL buildings); `tree` now passes the ctx incl. `fullProducerIndex`
  + `overrides`; `totals` passes `{ showExtractors }`.
- Actions: `setOverride(itemId, buildingId)` — if `buildingId` equals the global-default producer's id
  for that item, delete the override instead (so picking the default clears it); `clearOverrides()`;
  `setShowExtractors(b)`, `setShowIcons(b)`, `toggleOptions()`.
- On `load()` (version change): also reset `overrides = {}` (item ids differ across versions). Keep
  `showExtractors`/`showIcons`/`optionsCollapsed` (UI prefs) across version changes.

## CraftTreeNode — per-node picker UI
- When `node.candidates.length > 1`, render a compact version picker after the producer text: a small
  segmented control of the candidates (label each by a short version tag — derive `v1`/`v2` from
  whether the building id is the chain base vs upgraded, falling back to the building name). The active
  one = `node.building?.id`. Clicking a candidate calls `store.setOverride(node.itemId, buildingId)`.
  Show a subtle dot/asterisk when `node.isOverridden` to indicate a non-default pick.
- Keep it unobtrusive — the picker should not dominate the row; an icon + 2 small buttons is enough.

## Data refresh — icons
`scripts/refresh-data.mjs` is being extended (by the orchestrator) to also download building + item
icons (WebP) into `public/icons/{buildings,items}/`, reading the id list from the bundled data JSON.
The icons will already be present in `public/icons/` when you implement — just reference them via
`GameIcon.vue`. `zipline.webp` will be absent (expected) → fallback glyph.

---

# v3 FEATURES (theme + expand levels)

## E. Default target rate = single-building output (DONE)
`selectTargetItem(itemId)` / `load()` set `targetRate` to the chosen producer's
`recipe.output.amount_per_minute` (override-aware via `effectiveProducerFor`), falling back to 60.

## F. Expand-to-level control
- Store: `expandLevel` ref, default `Infinity` (start FULLY EXPANDED). `treeMaxDepth` computed (walk
  `tree` for deepest node depth). Action `setExpandLevel(n)`. A node at `depth d` shows children when
  `d < expandLevel`.
- New `TreeControls.vue` placed in `CraftTree.vue` BETWEEN the rate/name header and the scrollable
  tree. Buttons: `Collapse` (level 1) · numbered `1..min(treeMaxDepth,8)` · `All` (Infinity). Active
  level highlighted in the orange accent. Compact.
- `CraftTreeNode.vue`: `expanded = ref(props.depth < store.expandLevel)` and
  `watch(() => store.expandLevel, l => expanded.value = props.depth < l)`. Caret still toggles locally
  (manual deviation persists until the next level button press; collapsed children unmount and re-read
  the level on mount, so it stays consistent).

## G. Game-inspired theme (blend with the original, don't fully replace)
Signature cues from the game UI: warm near-black panels, ORANGE primary accent, cyan secondary,
angular/chamfered panel corners, uppercase tracked headers.
- Palette (use Tailwind arbitrary values where needed):
  - page bg `#0d0c0b` · panel `#1a1714` · elevated/hover `#24201b` · border `#34302a`
  - accent (orange) `#ee8b22` (hover `#f7a23f`) — PRIMARY: rates, active toggles, header underline,
    focus rings, the root "X/min". Replaces cyan as the primary accent.
  - secondary cyan `#22d3ee` — keep sparingly (override dot, a secondary value).
  - text primary `#f3f1ee` · secondary `#a8a29a` · muted `#736d64`.
- Chamfered corners: plain CSS classes in `style.css` (v4-safe, NOT @layer):
  `.clip-chamfer { clip-path: polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px) }`
  and `.clip-chamfer-sm` (6px). Apply to the header bar, Options panel, tree section, totals cards,
  and (sm) primary buttons. Do NOT clip an internally-scrolling element (clip the outer frame; keep the
  scroll child rectangular) — verify scrollbars aren't cut.
- Keep item-type chips and depth border-guide colors as-is (informative).

## H. Bigger text + icons
- `style.css :root { font-size: 17px }`. `GameIcon` default `size` 20 → 24.
- Tree node: item icon 16→24, building icon 14→20, picker icon 12→16; name/rate `text-sm`→`text-base`.
- Header: rate `text-2xl`→`text-3xl` (orange), name `text-xl`→`text-2xl`.
- Totals + Options: bump icon sizes (~22-24) and row text one step.

---

# v4 FEATURES (persistence + sharing)

## I. Default expand level = 2
`expandLevel` default changes from `Infinity` to `2`. It is a persisted view preference (localStorage),
NOT shown as a chip in the collapsed Options panel.

## J. Persisted state (localStorage) + shareable URL
Split state into:
- **Plan** (shareable): `version`, `targetItemId`, `targetRate`, `tier`, `overrides`.
- **View prefs** (local only): `showExtractors`, `showIcons`, `expandLevel`, `optionsCollapsed`.

New module `src/lib/persistState.ts`:
- `save(plan, prefs)` / `loadSaved()` → `localStorage['srp:state:v1']` as JSON. Serialize
  `expandLevel === Infinity` ↔ `'all'`. try/catch everything.
- `encodePlan(plan)` → `${origin}${pathname}?plan=<base64url(JSON)>`; `decodePlanFromUrl()` → PlanState|null
  (unicode-safe base64url; validate shape).

Store:
- `expandLevel` default `2`.
- `init()` (called on mount instead of `load(version)`): apply saved prefs; choose
  `plan = urlPlan ?? savedPlan ?? null`; `await load(plan?.version ?? DEFAULT_VERSION, plan)`.
- `load(v, plan?)`: after loading data, if `plan && plan.version === v` apply a VALIDATED plan
  (tier → only production baseIds, value 'v1'|'v2'; overrides → only entries whose item exists AND whose
  building actually produces it via fullProducerIndex; targetItemId → only if it exists else default
  first component; targetRate → positive number else `defaultRateForItem`). Otherwise keep current
  default-reset behavior. `setVersion(v)` stays a hard reset (no plan).
- `buildShareUrl()` → `encodePlan(currentPlan)`. Debounced `watch` over plan+prefs → `save(...)`.

UI: a **Share** button in the header — copies `buildShareUrl()` to the clipboard (graceful fallback if
the clipboard API is unavailable), with a transient "Copied!" state. No expand-level chip in Options.

---

# v5 FEATURES (theme switch + bigger machine icons)

## K. Theme switch — "Star Rupture" (default) and "Cyan"
Abstract all CHROME colors into CSS variables so a root `data-theme` swaps the palette. Define
defaults on `:root` (Star Rupture) and overrides on `:root[data-theme="cyan"]` (higher specificity).
Components reference `var(--token)` via Tailwind arbitrary values (`bg-[var(--panel)]`, etc.).

Hex → token map (replace these literals everywhere they appear as chrome):
`#0d0c0b`→`--bg`, `#1a1714`→`--panel`, `#24201b`→`--panel-2`, `#34302a`→`--border`,
`#ee8b22`→`--accent`, `#f7a23f`→`--accent-hover`, `#22d3ee`→`--accent-2`, `#f3f1ee`→`--text`,
`#f6f4f1`→`--text-strong`, `#d8d3cc`→`--text-2`, `#a8a29a`→`--muted`, `#736d64`→`--muted-2`.
Also: accent-button text `text-black`→`text-[var(--accent-on)]`; `bg-[#ee8b22]/20`→`bg-[var(--accent-soft)]`;
`border-[#ee8b22]/30|40`→`border-[var(--accent-soft-border)]`; GameIcon fallback `bg-slate-700`→`bg-[var(--panel-2)]`;
CraftTree spinner `text-cyan-400`→`text-[var(--accent)]`.

LEAVE theme-independent informative colors as-is: item-type chips (emerald/blue/purple/amber/red),
depth-guide border colors, the `raw`/`cycle` badges, error red, and the amber override `•` marker.

Palettes:
- `:root` (Star Rupture): bg #0d0c0b, panel #1a1714, panel-2 #24201b, border #34302a, accent #ee8b22,
  accent-hover #f7a23f, accent-on #000, accent-soft rgba(238,139,34,.18), accent-soft-border
  rgba(238,139,34,.35), accent-2 #22d3ee, text #f3f1ee, text-strong #f6f4f1, text-2 #d8d3cc,
  muted #a8a29a, muted-2 #736d64.
- `:root[data-theme="cyan"]` (original cyan/slate): bg #0f172a, panel #1e293b, panel-2 #334155,
  border #475569, accent #22d3ee, accent-hover #67e8f9, accent-on #07252b, accent-soft
  rgba(34,211,238,.16), accent-soft-border rgba(34,211,238,.35), accent-2 #34d399, text #f1f5f9,
  text-strong #fff, text-2 #cbd5e1, muted #94a3b8, muted-2 #64748b.

State/persistence: add `theme: 'starrupture' | 'cyan'` (default `'starrupture'`) to the store + to
`ViewPrefs` in `persistState.ts`. `setTheme(t)` action sets it and applies
`document.documentElement.dataset.theme = t === 'cyan' ? 'cyan' : ''`. `init()` applies it from saved
prefs. Include `theme` in the persistence watch. UI: a small segmented "Theme: Star Rupture / Cyan"
control in the Options → Display subsection. No collapsed chip for theme.

## L. Bigger machine icons
Building/machine icons in `CraftTreeNode.vue` go from `:size="26"` to `:size="35"` (≈1/3 larger).
Item icons stay 30. Do NOT change row padding (`py-2`/`py-2.5`) — icons grow, padding unchanged.

---

# v6 FEATURES (detail drawer + hover + construction cost)

Turn the planner into a browsable database: hover = quick card, click = full bottom drawer. Built on
data we already have (flexsurfer + corporations file). Construction cost is data-gated on an OPTIONAL
bundled file (an explorer is sourcing it) — build the DISPLAY now; it stays hidden until the file exists.

## M. Derived lookups (new — put pure builders in `src/lib/derived.ts`, expose via store computeds)
- `usedInIndex: Map<itemId, { buildingId: string; recipe: Recipe }[]>` — scan ALL buildings' recipes'
  inputs; for each input id, record (building, recipe) that consumes it. (Reference data → use all buildings.)
- `exportsByItem: Map<itemId, { corp: string; corpId: string; level: number; points: number }[]>` —
  from `corporations_components.json`: for each corp → each level → each `components[{id, points}]`,
  push `{corp: <corp display name>, corpId, level, points}` under that item id.
- `buildingUnlock: Map<buildingId, { corp: string; level: number }>` — from corp `levels[].rewards[].name`:
  if a building's `name` matches a reward name (case-insensitive, trimmed), record the LOWEST such level.
  Best-effort; most rewards won't match a building.
- `buildingCosts: Map<buildingId, { id: string; amount: number }[]>` — loaded from an OPTIONAL file
  `public/game-data/{version}/building_costs.json` shaped `{ "<buildingId>": [{ "id", "amount" }] }`.
  Loader fetches it; on 404/parse-error → empty map (no error). Reuse the existing `fullProducerIndex`
  for "made by".

## N. Drawer + hover state (store, transient — NOT persisted)
- `detail: { kind: 'item' | 'building'; id: string } | null`; actions `openItemDetail(id)`,
  `openBuildingDetail(id)`, `closeDetail()`.
- `hover: { kind: 'item' | 'building'; id: string; rect: DOMRect } | null`; actions `setHover(kind, id, el)`
  (with a ~350ms open delay handled in the component), `clearHover()`.

## O. Components
- `HoverCard.vue` — a SINGLE app-level instance (teleported to body), driven by `store.hover`. Renders the
  simple card: icon · NAME · type chip · short stat row. For an item: type + "Made by <building>". For a
  building: ⚡power · 🔥heat · ↓<#distinct inputs> · ↑<#recipes/outputs> · tier. Positioned near
  `hover.rect` (above if room, else below); never clipped (fixed + high z-index).
- `DetailDrawer.vue` — a SINGLE app-level bottom drawer (slide-up, ~`max-h-[70vh]`, fixed bottom, full
  width, with a dimmed backdrop). Close on ✕ button, Esc, and backdrop click. Driven by `store.detail`.
  - **Item view:** header (icon, name, type chip, stack/value IF available else omit) · **Made by**
    (building + recipe: inputs → output, /min) · **Used in** (chips of consuming items/buildings — each a
    cross-link) · **Exports** (corp + level + points rows) · description IF available · a **Set as target**
    button (calls `selectTargetItem(id)` + `closeDetail`).
  - **Building view:** header (icon, name, type chip, power/heat) · tier link (v1↔v2, cross-link) ·
    **Unlocked by** (corp + level, if matched) · **Construction** (materials from `buildingCosts`, IF
    available) · **Recipes** (a compact table: output → inputs, /min — all rows).
  - Every related item/machine is a cross-link that calls `openItemDetail`/`openBuildingDetail` (the drawer
    swaps content in place). Style with the theme tokens + `clip-chamfer`.

## P. Make things clickable + hoverable
- `CraftTreeNode.vue`: the item icon+name → `@click` `openItemDetail(node.itemId)`; the producer machine
  icon+name → `@click` `openBuildingDetail(node.building.id)`. Add `@mouseenter`/`@mouseleave` →
  `setHover`/`clearHover` on those two targets. Use `cursor-pointer`. Keep the version picker working
  (clicking a picker button must NOT open the drawer — stop propagation there).
- `TotalsPanel.vue`: raw-material rows → `openItemDetail`; building rows → `openBuildingDetail` (+ hover).
- Mount `<DetailDrawer />` and `<HoverCard />` once in `App.vue`.

## Q. Construction cost "under the machines" (data-gated on `buildingCosts`)
- `CraftTreeNode.vue`: under a producer machine line, if `buildingCosts.get(node.building.id)` exists,
  render a small muted sub-line: `🔧 <material> ×<amount × Math.ceil(buildingsNeeded)>` for each material
  (item name + icon). Hidden entirely when no cost data. (Applies to extractor nodes too when shown.)
- `TotalsPanel.vue`: add a **Construction materials** section aggregating across the whole tree —
  for each building node, `Math.ceil(buildingsNeeded) × material.amount`, summed by material id. Hidden
  when `buildingCosts` is empty.
- `DetailDrawer` building view shows the per-machine construction cost (see O).

## Acceptance criteria (v6)
20. Clicking an item or machine (tree or totals) opens a bottom drawer with its details + cross-links;
    Set-as-target works; Esc/backdrop/✕ closes. Hovering shows the simple card.
21. Exports + used-in + unlock are derived correctly from existing data; no console errors; build clean.
22. With no `building_costs.json`, nothing construction-related shows (no errors). When the file is added,
    per-machine cost lines appear under machines and a Construction-materials total appears.

## Acceptance criteria (v5)
18. A theme toggle switches the whole UI between the orange Star Rupture palette and the cyan/slate
    palette; choice persists across reloads; default is Star Rupture.
19. Machine icons are ~1/3 larger; row padding is visually unchanged.

## Acceptance criteria (v4)
15. Reloading the page restores version, target item+rate, tier, overrides, and view prefs.
16. Default expand level is 2 on a fresh load (no saved state).
17. The Share button yields a URL that, opened in a clean context, reproduces the plan; invalid
    overrides/targets across versions are dropped without errors.

## Acceptance criteria (v3)
12. Selecting an item sets the rate to one building's output; changing the number still works.
13. Tree starts fully expanded; the level control collapses/expands to any depth; per-node carets still
    work; no console errors.
14. Theme reads as the game (orange accent + warm dark + chamfered panels) while keeping the original
    structure; text/icons are noticeably larger; layout doesn't break at desktop or narrow widths.

## Acceptance criteria (v2)
7. Each node with >1 producing building shows a version picker; changing it updates that item's recipe
   everywhere it appears and recomputes rates + totals.
8. Machine icons render next to producers and differ between v1 and v2; a missing icon shows a letter
   fallback, never a broken image. The "Show machine icons" toggle hides/shows them.
9. "Show extractors" off → raw resources are plain leaves and extractors are absent from Buildings
   totals; on → extractor nodes show their machine + count and are counted in totals.
10. The Options panel sits at the top, collapses, and shows accurate summary chips when collapsed.
11. Switching game version clears node overrides; build + type-check stay clean; no console errors.
