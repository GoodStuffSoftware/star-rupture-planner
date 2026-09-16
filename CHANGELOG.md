# Changelog

All notable changes to the Star Rupture Planner project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
