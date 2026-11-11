# Changelog

All notable changes to the Star Rupture Planner project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **New game build check**: A daily check compares the latest Steam build with the planner data and opens an issue when the planner is still behind a day after the update was announced (live and test builds alike). The planner's own pipeline should cover a new build within hours, so an issue means something is stuck. It sends a Discord notice when a webhook is configured.
- **Game data straight from the game files**: A new extractor reads the game build itself and a publish workflow turns it into planner data and icons, so a new game version can appear in the version picker without waiting on the upstream data repo.
- **Every playable build is covered, and the pipeline says so**: The publish workflow tags each build it covers (`srdata-<branch>-<buildid>`: published, or checked and unchanged) and each build it could not (`srdata-failed-<branch>-<buildid>`, with a Discord alert, never the covered tag), so the mod CI can tell which live and test builds still lack planner data. A test build waiting for its news post gets no tag and is retried.
- **New items and buildings come out complete**: The converter now derives the type of a brand-new item (raw, processed, component, material, ammo) and building from the game files, so a new game version needs no manual follow-up. Hand-curated values still win. On the Update 2 data it reproduces 104 of 104 item types and 43 of 43 building types.

### Fixed
- **Game data publish ignores the CI tools artifact**: The scheduled publish no longer mistakes the extractor's tools artifact for a game build, so it stops posting a bogus "not usable" notice to Discord.
- **Game data updates now go live**: When the scheduled job refreshes the game data, the site is redeployed automatically. Before, the new data sat in the repo until someone pushed. A Discord notice (when a webhook is configured) reports each deploy or failure, and a data refresh that cannot reach upstream now fails loudly instead of silently keeping the old files.

---

## [1.6.1] - 2026-11-10

### Fixed
- **Switching game version keeps your tabs**: Picking the version you are already on does nothing, and switching to another one keeps every tab (order, pins, item, rate) and your closed-tab list. A tab whose item is not in the other version stays, shown as "Not in this game version", and works again when you switch back.

---

## [1.6.0] - 2026-11-07

### Added
- **Edit the root rate inline**: The big rate at the top of the tree is now editable in place. Use the -/+ buttons (each steps one machine), the arrow keys or the mouse wheel. Targets are whole numbers, and exact machine multiples are allowed. Typing commits after a 400 ms pause, the tree's top number and the header rate field stay in sync, and clicking puts the caret where you click.
- **Edit child rates inline**: Child rates in the tree show as plain numbers with a dotted underline and -/+ buttons, one size larger than before, with at most 2 decimal places.
- **Default for new targets**: A new Options setting (N machines or items/min) sets the rate for every new target, including `?add=` links. Text size now sits directly below it.
- **Header rate field**: ArrowUp/ArrowDown step by 1, and the field is wide enough for 4 digits.
- **Right-click tab menu**: Right-click a recipe tab (or long-press it, or press the Menu key or Shift+F10) for New tab, Pin/Unpin, Close tab, Close other tabs, Close tabs to the right and Reopen closed tab. Right-click again within a moment (or press the Menu key) to reach the browser's own menu. The + and Sigma All buttons offer New tab and Reopen.
- **Pinned tabs and tab behaviour**: Pinned tabs stay at the left and show only the icon. The + button opens an empty "New tab" and focuses a cleared item search; picking an item fills the tab at the default rate. The last 10 closed tabs can be reopened at their old position, synced across browser tabs.
- **Footer redesign**: Studio logo, GitHub and Feedback links, a centred support button, and the app version linking to this changelog. The layout holds down to small phones.

### Changed
- **Icons**: Icons are cropped to their visible art and centred everywhere, including the hover preview, and fill their tab.
- **Game data**: The default game version is never a test (PTB) build, and the version list shows the newest first.
- **Saving**: The plan now saves when you close the browser tab.
- **Mobile**: Layout fixes for the root rate, Options and footer on phones.

### Fixed
- **Stale tab no longer overwrites a newer plan**: Each tab remembers which saved plan it last read and, before writing, checks that storage still holds it. A tab that missed a sibling's save now takes the newer plan instead of replacing it, and an `?add=` item is added on top of any plan saved while the page was loading, so the in-game "Launch planner" item can no longer be lost to an older open tab.
- **Tab sync gaps**: The version, preferences and share prompt now stay in sync across browser tabs.

---

## [1.5.0] - 2026-09-16

### Added
- **Icon Hover Zoom**: Hovering any game icon for 500ms (or press-and-hold on mobile) reveals a full-size 160px preview popup with item name label, rendered via Teleport so it's never clipped by any container.
- **Release Gate Script** (`scripts/check-release-gate.mjs`): Pre-commit hook validates that `package.json` version, `CHANGELOG.md` entry, and a git tag all align before allowing a commit. `npm run release` automates tag creation.
- **CHANGELOG.md**: Project changelog added, crawled from git history, following Keep a Changelog + Semantic Versioning.

### Changed
- **Version Badge Consistency**: Building version suffixes stripped from display names everywhere (`Furnace v.2` → `Furnace`). Only a blue `v2` badge is shown for upgraded buildings — no `v1` indicator (absence = v1).
- **Tree Root as Header**: Removed the redundant header row above the craft tree. The root node (depth 0) now acts as the header with a larger icon (48px), bold xl name, and orange `30/min` rate pinned right.
- **Share Button Inline**: Share button moved from the old header into the Expand level controls row, pinned to the right.
- **Husky Pre-commit**: Release gate check added to the pre-commit hook alongside lint-staged and typecheck.

### Fixed
- **GameIcon Stacking Context**: Removed `position: relative` from the icon wrapper span that was breaking the history drawer dropdown z-index layering.
- **Zoom Coordinates**: Fixed stale event object bug in hover zoom — coordinates are now captured eagerly at mouseenter time rather than inside the async timer closure.

---

## [1.4.0] - 2026-09-16

### Added
- **Session-Based Drawer Navigation History**: Automatically records breadcrumb trails per detail drawer session.
- **History Dropdown Menu**: View, restore, and delete up to 100 past drawer navigation sessions with a custom vertical "blinds" unfurling animation.
- **Header Navigation Controls**: Dedicated Search Index button (`🔍`), original chevron expand toggle (`^`), and MicroJoystick navigation.

### Changed
- **Architectural Store Refactoring**: Modularized Pinia state management into `dataStore`, `detailStore`, `prefsStore`, and `plannerStore`.
- **Component Modularization**: Decoupled monolithic components (`DetailDrawer`, `CraftTreeNode`, `TotalsPanel`) into focused subcomponents.
- **History Dropdown Alignment**: Left-aligned the history dropdown menu with the history clock icon button with solid opaque panel styling.
- **Item Index Category Chips**: Unified chip styling (`text-xs font-medium`) and linked chip sizes directly to user-selected global text size settings.

---

## [1.3.0] - 2026-09-15

### Added
- **Update 2 Support**: Full support for Star Rupture Update 2 game data, alternate recipe paths, and building tier variants.
- **Auto-Update Workflow**: Automated dataset generation scripts and version tracking.
- **Show Overages Toggle**: Global preference to show or hide overproduction calculations on tree nodes.
- **Path-Based Node Overrides**: Fine-grained per-node recipe and overage overrides across deep tree paths.

### Changed
- **Options Layout**: Upgraded drawer options view to a sleek 2-column layout.
- **Infrastructure**: Updated GitHub Actions CI runners and deployment pipelines to Node 24.

---

## [1.2.0] - 2026-06-22 - 2026-06-23

### Added
- **Multi-Target Recipe Tabs**: Create, rename, reorder (drag & drop), and manage multiple crafting targets simultaneously.
- **"All Totals" Aggregated View**: Combined totals dashboard calculating raw materials, buildings, power, and heat requirements across all active tabs.
- **Global Text Size Scaling**: Dynamic text sizing preferences across all UI components and tree nodes.
- **Per-Tab Expansion Scope**: Independent collapse/expand states for individual target tabs.

### Changed
- **Responsive Mobile Navigation**: Compact toolbars, inline option chips, scrollable tab strip, and bottom-docked totals drawer on mobile.
- **Drawer Integration**: Opening items from the detail drawer can spawn dedicated recipe tabs directly into the main planner.

---

## [1.1.0] - 2026-06-18 - 2026-06-19

### Added
- **Per-Row Overage Steppers**: Per-occurrence overproduction steppers snapping to whole machine counts with deficit warning flags.
- **Collapsible Totals Subsections**: Expandable and collapsible material and building sections in the Totals panel.
- **Intermediate Products Section**: Dedicated breakdown for intermediate crafting components in the total requirements view.

### Fixed
- **Tree Node Remounting**: Optimized node keying to prevent DOM remounting during overage stepper adjustments.

---

## [1.0.0] - 2026-06-06 - 2026-06-07

### Added
- **Initial Release**: Interactive crafting-tree planner for Star Rupture.
- **Visual Design**: Sleek dark mode theme with glassmorphism, HSL color tokens, chamfer styling, and responsive drawer interface.
- **URL Sharing**: Instant planner configuration sharing via compressed URL hash payload.
- **Developer Tools**: Husky pre-commit hooks for ESLint and `vue-tsc` type checking; GitHub Actions CI/CD pipeline deploying to Cloudflare Pages.
- **Community Support**: Embedded Stripe checkout tip jar modal.
