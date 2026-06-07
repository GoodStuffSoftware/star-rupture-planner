# Attribution & Third-Party Notices

## Game data & icons — flexsurfer/starrupture-planner (MIT)

The crafting data in [`public/game-data/`](public/game-data/) and the building/item icons in
[`public/icons/`](public/icons/) are sourced from the open-source project
**[flexsurfer/starrupture-planner](https://github.com/flexsurfer/starrupture-planner)** and are
used under the MIT License.

- **Source:** https://github.com/flexsurfer/starrupture-planner
- **Files used:**
  - `assets/game-data/{version}/buildings_and_recipes.json`
  - `assets/game-data/{version}/items_catalog.json`
  - `assets/game-data/{version}/corporations_components.json`
  - `assets/icons/buildings/*.webp`, `assets/icons/items/*.webp`
- **How to refresh:** `npm run refresh-data` re-downloads these from the upstream repo.

This project bundles copies of those files; full credit for compiling the game data and icons goes
to the flexsurfer/starrupture-planner contributors.

### License text (flexsurfer/starrupture-planner)

```
MIT License

Copyright (c) 2025 flexsurfer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Construction-cost data — Star Rupture Wiki (CC BY-SA 4.0)

The building construction-material costs in `public/game-data/{version}/building_costs.json` are
derived from the community **[Star Rupture Wiki](https://starrupture.wiki.gg)** and are used under
**CC BY-SA 4.0**. Attribution: *"Star Rupture Wiki contributors, CC BY-SA 4.0,
https://starrupture.wiki.gg"*. Under the licence, that data file is itself offered under CC BY-SA 4.0
(share-alike applies to the data artifact, not to this project's application code).

Coverage is partial — only ~16 of the 44 buildings currently have a documented construction cost on
the wiki; buildings without data simply show no construction line.

## The game

*Star Rupture* is developed by **Creepy Jar**. All game names, recipes, artwork, and trademarks are
the property of their respective owners. This is an unofficial, fan-made planning tool and is **not
affiliated with or endorsed by Creepy Jar**.
