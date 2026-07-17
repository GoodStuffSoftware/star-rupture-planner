# Star Rupture Planner — Agent Rules & Context

> Re-read this file before starting tasks. Covers stack, structure, deploy pipeline, local gates, delegation rules, and commit conventions.

---

## Project Overview

**Star Rupture Planner** — a crafting-tree planner for the video game *Star Rupture*. Pick a target item + desired throughput; the app shows the full production chain as a collapsible tree with building counts, per-minute rates, and a totals panel (raw materials, buildings, power/heat).

**Org:** Good Stuff Software LLC (GoodStuffSoftware org on GitHub). This is a **PUBLIC** repo and a studio "site driver" tool — it demonstrates the studio's craft and drives traffic. Code quality and UX reflect on the brand.

**Live site:** https://starrupture.goodstuff.software

**Repo:** https://github.com/GoodStuffSoftware/star-rupture-planner

---

## Tech Stack

- **Vite** + **Vue 3** (`<script setup lang="ts">` — no Options API)
- **TypeScript** (strict via `vue-tsc`)
- **Pinia** (wired in `src/main.ts`)
- **Tailwind CSS v4** (`@import "tailwindcss"` in `src/style.css`; no `tailwind.config.ts` needed)
- Node 22, `npm` for package management

**Feature roadmap:** `BUILD_SPEC.md` is the canonical spec source for v4/v5 features (persistence, shareable URLs, theme switch). Read it before implementing new features.

---

## Source Structure

```
src/
  types/game.ts            # data + resolved-tree TypeScript types
  data/
    loader.ts              # runtime fetch of game-data JSON per version
    versions.ts            # version list (earlyaccess, playtest, update1, update1_PTB)
  lib/
    resolver.ts            # resolveTree() + aggregateTotals() — the calc core
    recipeIndex.ts         # tier-aware building filtering + producer ranking
    derived.ts             # derived/computed helpers
    format.ts              # number/string formatting utilities
    persistState.ts        # localStorage persistence helpers
  stores/
    plannerStore.ts        # Pinia store: state + reactive tree/totals
  components/
    App.vue                # root component
    CraftTree.vue          # tree container
    CraftTreeNode.vue      # recursive tree node
    TargetSelector.vue     # item + rate selector
    VersionSelector.vue    # game-version picker
    OptionsPanel.vue       # collapsible options (building tiers, toggles)
    TotalsPanel.vue        # aggregated totals
    TreeControls.vue       # expand/collapse-to-level control
    DetailDrawer.vue       # per-node detail drawer
    GameIcon.vue           # WebP icon wrapper
    HoverCard.vue          # hover detail card
    ShareButton.vue        # share/URL feature
    ChamferToggle.vue      # toggle component
  main.ts                  # app entry point, Pinia init
  style.css                # Tailwind v4 entry

public/
  game-data/               # bundled static game data (fetched at runtime)
    earlyaccess/
    playtest/
    update1/
    update1_PTB/
      buildings_and_recipes.json
      items_catalog.json
      corporations_components.json
  icons/                   # building + item WebP icons (from upstream MIT data)
  icons.svg                # sprite sheet
```

**Data source:** `public/game-data/` and `public/icons/` come from [flexsurfer/starrupture-planner](https://github.com/flexsurfer/starrupture-planner) (MIT). Update via `npm run refresh-data`. Attribution details in `ATTRIBUTION.md`.

---

## Deploy Pipeline

**Trunk-based. Push `main` → production. No staging branch, no preview environment.**

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | https://starrupture.goodstuff.software |

**Workflows:**
- `.github/workflows/deploy.yml` — fires on push to `main`. Runs `npm ci`, `npm run build`, then `cloudflare/wrangler-action@v3` with `pages deploy dist --project-name=star-rupture-planner --branch=${{ github.ref_name }}`.
- `.github/workflows/ci.yml` — fires on PRs targeting `main`. Runs lint → typecheck → build. Must pass before merge.

**Secrets** (GitHub repo encrypted secrets — do NOT hardcode):
- `CLOUDFLARE_API_TOKEN` — "GSS Pages Deploy" token (all-zones, Pages:Edit + DNS:Edit). Shared across Good Stuff Software apps; do not rotate without coordinating.
- `CLOUDFLARE_ACCOUNT_ID` — `a32bba62c77df5e8f6bd33d04478ec34`

---

## Branch Model

Trunk-based. `main` is the single integration branch and deploys directly to production on push.

```
main             → production (auto-deploy on push)
feat/<scope>     → optional, for larger changes; merge to main
fix/<scope>
chore/<scope>
docs/<scope>
```

For small changes, commit directly to `main` (husky gate enforces quality). Feature branches are optional — use them for larger multi-commit work, then merge to `main`.

---

## Local Gates (Husky)

Broken code cannot reach git. The hooks enforce this:

**Pre-commit:** `lint-staged` (ESLint `--fix` + Prettier `--write` on staged `src/**/*.{ts,vue}`) + project-wide `vue-tsc -b --noEmit` typecheck.

**Pre-push:** Full `npm run build` (typecheck + Vite build). Build must pass before push reaches remote.

Mid-feature escape hatch: `git commit --no-verify` (use sparingly; state the reason in the commit message).

---

## Lint & Format

- **ESLint:** flat config (`eslint.config.js`) with `@typescript-eslint` + `eslint-plugin-vue`
- **Prettier:** `.prettierrc.json` — single quotes, no semicolons, 100-col line width
- Run checks: `npm run lint` / `npm run typecheck` / `npm run build`
- Auto-fix staged files: `npm run lint:fix` / `npm run format`

---

## Commit Conventions

**Format:** `type(scope): subject`

**Allowed types:** `feat`, `fix`, `refactor`, `style`, `docs`, `perf`, `test`, `build`, `ci`, `chore`

**Examples:**
- `feat(tree): add per-node version override UI`
- `fix(resolver): guard against cycle in recursive tree walk`
- `chore(data): refresh game-data to update1_PTB`

**Co-author line (always include):**
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

**Discipline:** One commit per logical feature. Do not commit after every file edit. Group all changes for a task into one meaningful commit.

---

## Delegation (Lean)

The main session orchestrates — it does not execute code-touching changes directly. Teammates handle execution.

**Default routing:**
- Read-only lookup, structure questions, "where is X" → `srp-explorer`
- Feature builds, bug fixes, 1–3 file changes → `srp-builder`
- Lint / typecheck / diff quality pass → `srp-reviewer`

**Unique team name per session:** `srp-YYYYMMDD-<slug>` (e.g. `srp-20260607-share-url`). Never reuse a bare team name across sessions — it accumulates ghost teammates and bleeds idle messages.

**Reviewer pairing:** Every code-change teammate must pair with `srp-reviewer` before claiming done. Pipeline: builder → reviewer sign-off → user sign-off.

**Reports to files, not chat.** Long teammate reports go to `~/.claude/tasks/<team-name>/<batch-id>-<role>.md`. The teammate `SendMessage`s the lead a 1-line pointer.

---

## Memory

Memory files live at `C:\Users\msant\.claude\projects\C--Users-msant-dev\memory\` (Windows-only; no WSL mirroring for this project).

---

## Agent Rules

1. **Always read before editing.** Use Read tool to check file contents before any Edit/Write.
2. **Run lint + typecheck before reporting done.** `npm run lint && npm run typecheck`.
3. **Meaningful commit messages.** Conventional format, describe the change.
4. **BUILD_SPEC.md is the spec.** Check it before implementing any non-trivial feature.
5. **User's manual changes set the contract; tests follow.** Never revert a user's deliberate change to satisfy a stale expectation.
6. **No `.claude/` commits needed.** The directory is gitignored — agent files are local-only by design.

---

_Last updated: 2026-06-07_
