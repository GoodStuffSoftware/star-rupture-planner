# Star Rupture Planner

A crafting-tree planner for the game **Star Rupture**. Pick a target item and a desired
throughput, and the app shows the full production chain as a collapsible tree — the building
that makes each item, how many buildings you need, and the per-minute rates — plus a totals
panel summarising raw materials, building counts, and power/heat.

Unlike a fixed calculator, it has a **building-tier selector**: choose which v2 machines you've
unlocked and the calculator switches to the correct (v2) recipes, falling back to v1 for items a
v2 building can't make.

## Features

- **Crafting tree** — recursive nodes down to raw resources, with machine + item icons, producer
  building, building count, item-type chips, and required throughput per node. Starts fully expanded,
  with an expand/collapse-to-level control between the header and the tree. Picking a target item
  defaults the rate to a single producing machine's output.
- **Options panel** (collapsible, top of page; shows summary chips when collapsed):
  - **Global building versions** — per upgradeable building (Fabricator, Constructorizer, Furnace,
    Ore Excavator, Compounder, …), toggle v1/v2. Owning v2 keeps both tiers available and prefers
    the v2 recipe where it exists (matching in-game behaviour — you keep your v1 machines).
  - **Show extractors** — include extractor machines (Ore Excavator, etc.) as nodes in the tree and
    in the Buildings totals, or stop at raw resources.
  - **Show machine icons** — toggle the WebP icons on/off.
- **Per-node version override** — at any node, pick which building/version produces that item; the
  choice applies to that item everywhere it appears (kept consistent) and recomputes the chain.
  Overridden nodes are marked, and "Reset node overrides" clears them.
- **Game-version selector** — switch between `playtest`, `earlyaccess`, `update1_PTB`, and
  `update1`. Versions without tiered buildings show "No upgradeable buildings".
- **Totals panel** — aggregated raw materials/min, total buildings (rounded up + exact), and total
  power/heat draw, all with icons.

## Tech

Vue 3 (`<script setup lang="ts">`) · Vite · TypeScript · Pinia · Tailwind CSS v4.

```
src/
  types/game.ts          # data + resolved-tree types
  data/                  # version list + runtime loader
  lib/recipeIndex.ts     # tier-aware building filtering + producer ranking
  lib/resolver.ts        # resolveTree() + aggregateTotals() — the calc core
  stores/plannerStore.ts # Pinia store: state + reactive tree/totals
  components/             # selectors, recursive tree node, totals panel
public/game-data/        # bundled game data (see Data below)
```

The calculation core is `lib/resolver.ts`: it walks each recipe, computes
`buildingsNeeded = requiredRate / output.amount_per_minute`, recurses on inputs scaled by that
count, guards against cycles, and terminates at extractor recipes (which have no inputs).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (vue-tsc) + production build to dist/
npm run preview    # serve the production build
```

## Data

Game data **and icons** come from [**flexsurfer/starrupture-planner**](https://github.com/flexsurfer/starrupture-planner)
(MIT). They're **bundled** into `public/game-data/` and `public/icons/` rather than fetched live, so the
app works offline and is stable against upstream changes. Full third-party notice (incl. the upstream
MIT license text) is in [ATTRIBUTION.md](ATTRIBUTION.md).

To pull the latest data + icons (e.g. after a game update):

```bash
npm run refresh-data
```

This re-downloads the per-version JSON (`buildings_and_recipes.json`, `items_catalog.json`,
`corporations_components.json`) and the building/item icons from the upstream repo, and validates them.

## Credits & license

- Game data and icons © the [flexsurfer/starrupture-planner](https://github.com/flexsurfer/starrupture-planner)
  contributors, used under the MIT License — see [ATTRIBUTION.md](ATTRIBUTION.md).
- *Star Rupture* is a game by **Creepy Jar**; this is an unofficial fan tool, not affiliated with or
  endorsed by Creepy Jar.
- This project's own code is MIT licensed — see [LICENSE](LICENSE).
