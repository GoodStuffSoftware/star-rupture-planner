# game-extract

.NET 10 console app that reads the installed Star Rupture game files (the `.pak`/`.utoc` containers) with
[CUE4Parse](https://github.com/FabianFG/CUE4Parse) and writes **raw JSON plus icon PNGs**. It is leg 1 of the planner's
own data pipeline: a later step converts this raw output into the planner's `buildings_and_recipes.json`,
`items_catalog.json` and `corporations_components.json`, and another runs it in CI.

Nothing here is game content. **Never commit the output** (extracted JSON, PNGs, `.usmap` files); `.gitignore` covers
`extract-out/` and `*.usmap`.

## Usage

```
GameExtract --paks <dir> --usmap <file> --out <dir> --build <steam buildid> [--engine GAME_UE5_6] [--allow-mismatch]
```

| Option | Meaning |
|---|---|
| `--paks` | `StarRupture/Content/Paks` of the install (the folder with `pakchunk0-Windows.utoc`). Read only; the `~mods` and `LogicMods` subfolders are not loaded. |
| `--usmap` | The `.usmap` property mappings **for exactly this build** (see "Inputs"). |
| `--out` | Output folder (created). |
| `--build` | Steam build id of the install (e.g. `25646882`), recorded in the manifest and checked against `appmanifest_*.acf` when that is found. |
| `--engine` | CUE4Parse `EGame` name. Default `GAME_UE5_6` (the game is UE 5.6.1; `GAME_UE5_5` and older throw a `VersionException`). |
| `--allow-mismatch` | Experiments only. Turns the guard failures into warnings and writes the data anyway. Output of such a run must not be published. |

Run (the machine has the SDK in `C:\Users\msant\.dotnet`, not on PATH):

```
set DOTNET_ROOT=C:\Users\msant\.dotnet
dotnet run -c Release --project tools/game-extract -- --paks "<install>\StarRupture\Content\Paks" ^
  --usmap "<...>\5.6.1-127004+++Earth20+Neon-StarRupture-Client.usmap" --out extract-out --build 25646882
```

Exit codes: `0` ok, `1` bad arguments or crash, `2` usmap does not match the build, `3` extracted data failed the guard.
A full run takes about 10 seconds.

Build and test:

```
dotnet build tools/game-extract/GameExtract.csproj -c Release
cd tools && dotnet test --project game-extract-tests/GameExtract.Tests.csproj -c Release
```

(`tools/global.json` switches `dotnet test` to the Microsoft.Testing.Platform runner that .NET 10 requires.)

## Inputs

- **The game files.** No AES key and no Oodle library are needed: the content is unencrypted and uncompressed.
- **A `.usmap` for the same changelist as the game.** The cooked assets use unversioned properties, so without mappings
  nothing can be read, and mappings from another build do not fail: they silently drop fields. They come from a
  Dumper-7 run on the running game (the mod team publishes them in `StarRupture-Plugin-SDK/StarRupture SDK/usmap/CL<n>/`).
  Use the `Client` usmap.

## Output layout

```
manifest.json               build id, usmap, engine, versions, counts, guard result, warnings
recipes.json                every CR_* recipe
recipe-collections.json     every CRC_* collection (which recipes a building can craft)
buildings.json              every BD_* building joined with its DA_* config
extractor-rates.json        drill/extractor output per resource and purity (see below)
items.json                  every I_* item
corporations.json           corporations (levels, XP, rewards) + component-point tables + reward building collections
localization/en.json        { tableId: { key: English text } } from every StringTable asset
localization/locales.json   the languages present in the paks (only English is extracted)
icons/items/<texture>.png   item icons
icons/buildings/<texture>.png  building icons
```

Asset references are package paths without the object index (`/Game/Chimera/Items/I_Accumulator`). Enum values are
kept as the game writes them (`ECrBuildingType::Crafting`).

Key fields:

- **recipes**: `output {item,count}`, `inputs [{item,count}]`, `buildTime` (as stored), `buildTimeEffective`,
  `buildTimeDefaulted`. Rate per minute is `count * 60 / buildTimeEffective` (the converter's job).
  **Default-time rule:** a recipe whose asset has no `BuildTime` takes 10 seconds. Unversioned UE properties omit default
  values, so the default is not in the data; 10 s is what reproduces the planner's update2_QoL numbers for the 10 recipes
  concerned (spike 2026-11-07). `manifest.json` records the rule and lists the affected recipes as warnings.
- **buildings**: `power` (`electricityValue` from `CrElectricityTrait`), `heat` (`CoolingCapacityUsing` from
  `CrMassTemperatureTrait`), `recipeCollections`, `crafting` (loop duration), `isExtractor`, `resourceRequirements`,
  `unlockedBy` (the corporation level that rewards the building), `traits` (non-cosmetic trait exports).
  **Tier/upgrade:** the game has no explicit tier or upgrade field. `tier`/`baseBuilding` come from the id convention
  (`BD_MechanicalDrillTier2` is tier 2 of `BD_MechanicalDrill`, which is tier 1); upgrade pairing beyond that stays a
  converter-side curation.
- **extractor-rates**: the planner's drill numbers are **not** in a building's recipe collection. Each
  (extractor, resource, purity) has its own recipe asset (`Crafting/MechanicalDrill/CR_CalciumOrePure_MechanicalDrill`,
  `Crafting/MechanicalDrillTier2/...`), selected through `Environment/MineableOre/BuildingOrePurityRecipeData`. The file
  lists each row with the recipe, output count and a derived `perMinute`. For example calcium ore: Ore Excavator
  (tier 1) 60 / 120 / 240 per minute for impure / regular / pure, Ore Excavator v.2 (tier 2) 180 / 300 / 480.
- **items**: `uniqueItemName`, `displayName`, `uiItemType` (type/category), `maxStack`, `icon`. The data sits on the
  class default object of the item blueprint.
- **corporations**: `levels[]` with `xp` (= `ReputationRequired`) and the reward lists; `componentPoints` are the
  `CrExporterItemRow` data tables (`Item`, `Level`, one value column per corporation).
- **localization**: English strings come from the `StringTable` assets. The paks hold `.locres` files for 12 languages
  (`manifest.json` lists them); other languages are not extracted.

## The guard

A wrong usmap does not throw, it makes fields vanish (with a usmap from an older build, 0 of 186 recipes kept
`BuildTime`, `OutputItem` and `NeededResources`). Two checks stop that, both exit non-zero unless `--allow-mismatch`:

1. **Usmap vs. build (exit 2), before any asset is read.**
   - Usmap changelist: from the file name (`5.6.1-<CL>+++<branch>-...usmap`), else a `CL<digits>` in the file name, else in
     its folder name (`.../CL118258/Client.usmap`). The usmap format has no readable header field for it. If none is
     found the run fails: name the file properly.
   - Game changelist: the Windows version resource of the shipping exe (`Binaries/Win64/*-Shipping.exe`, ProductVersion
     `++Earth20+Neon-CL-127004`), else a `CL<digits>` marker file/folder in the install root.
   - The two must be equal. Also, when an `appmanifest_*.acf` of this install is found above the paks folder, its `buildid`
     must equal `--build`.
2. **Data (exit 3), after reading.** Offending assets are listed (first 50 on stderr, all in `manifest.json`). On failure
   only `manifest.json` is written, no data files.
   - a recipe without `OutputItem` fails;
   - a recipe without `NeededResources` fails unless it is an extractor recipe (in an extractor building's collection, in
     the purity table, or in a folder shared with those);
   - `BuildTime`: isolated omissions are normal (10 of 257 recipes in CL127004, default rule above). If more than 15
     percent of recipes lack it, every one of them is listed and the run fails. (The brief's "any recipe missing time" is
     implemented as this threshold because the default rule makes single omissions legitimate.)
   - a production building (type Crafting, RawMaterialProcessing, Extraction or TemperatureManagement, and it crafts or is
     an extractor) without a `CrElectricityTrait` carrying `ElectricityValue` fails. Habitat interiors have no power
     trait by design and are not checked;
   - any package that fails to load, a missing purity table, or zero recipes/buildings/items/corporations.

## Packages

CUE4Parse and CUE4Parse-Conversion are pinned to `1.2.2.202611`. Two transitive packages with security advisories are
pinned in `GameExtract.csproj`: `Microsoft.Bcl.Memory` 10.0.14 (patched) and `SixLabors.ImageSharp` 3.2.0 (patched).
ImageSharp 3.2.0's build targets demand a Six Labors license, and the tool never calls ImageSharp (textures are decoded
by CUE4Parse-Conversion and encoded with SkiaSharp), so the pin uses `ExcludeAssets="all"`: the patched version is in the
dependency graph, nothing of it ships or runs.
