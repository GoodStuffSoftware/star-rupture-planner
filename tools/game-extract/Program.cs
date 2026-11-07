using System.Reflection;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion.Textures;
using SkiaSharp;

namespace GameExtract;

public static class Program
{
    // Exit codes: 0 ok, 1 bad arguments or crash, 2 usmap/build mismatch, 3 extracted data failed the guard.
    public static int Main(string[] args)
    {
        Options opt;
        try { opt = Options.Parse(args); }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine(Options.Usage);
            return 1;
        }
        try { return Run(opt); }
        catch (Exception ex)
        {
            Console.Error.WriteLine("FAILED: " + ex);
            return 1;
        }
    }

    static int Run(Options opt)
    {
        if (!Enum.TryParse<EGame>(opt.Engine, out var game))
        {
            Console.Error.WriteLine($"Unknown --engine {opt.Engine} (an EGame name, e.g. GAME_UE5_6)");
            return 1;
        }
        if (!Directory.Exists(opt.Paks)) { Console.Error.WriteLine($"--paks folder not found: {opt.Paks}"); return 1; }
        if (!File.Exists(opt.Usmap)) { Console.Error.WriteLine($"--usmap file not found: {opt.Usmap}"); return 1; }

        // Guard 1: usmap vs. build, before any asset is read.
        var usmapCl = UsmapGuard.UsmapChangelist(opt.Usmap);
        var (buildCl, buildClSource) = UsmapGuard.BuildChangelist(opt.Paks);
        var mismatch = UsmapGuard.Check(opt.Usmap, opt.Paks, opt.Build);
        Console.WriteLine($"build {opt.Build}: game CL {buildCl?.ToString() ?? "?"} ({buildClSource}); usmap CL {usmapCl?.ToString() ?? "?"} ({Path.GetFileName(opt.Usmap)})");
        if (mismatch.Count > 0)
        {
            foreach (var m in mismatch) Console.Error.WriteLine("GUARD (usmap/build): " + m);
            if (!opt.AllowMismatch)
            {
                Console.Error.WriteLine("Refusing to extract. Use a usmap for this build; --allow-mismatch is for experiments only.");
                return 2;
            }
            Console.Error.WriteLine("--allow-mismatch given: continuing. Output from this run must not be published.");
        }

        var started = DateTime.UtcNow;
        var ex = new Extractor(opt.Paks, opt.Usmap, game);
        Console.WriteLine($"mounted {ex.MountedContainers} containers, {ex.FileCount} files");

        var recipes = ex.Recipes();
        var collections = ex.RecipeCollections();
        var items = ex.Items();
        var corps = ex.Corporations();
        var buildings = ex.Buildings(corps);
        var (rates, purityTableFound) = ex.ExtractorRates(recipes, buildings);
        var english = ex.EnglishStrings();
        var locales = ex.AvailableLocales();

        // collections -> which building configs use them
        foreach (var col in collections)
            col.UsedByBuildings = buildings.Where(b => b.RecipeCollections.Contains(col.Asset)).Select(b => b.ConfigAsset).Distinct().OrderBy(s => s, StringComparer.Ordinal).ToList();

        // Guard 2: the data itself.
        var extractorRecipes = DataGuard.ExtractorRecipes(recipes, collections, buildings, rates);

        var problems = new List<Problem>();
        problems.AddRange(ex.LoadErrors);
        problems.AddRange(DataGuard.CheckRecipes(recipes, extractorRecipes));
        problems.AddRange(DataGuard.CheckBuildings(buildings));
        if (!purityTableFound) problems.Add(new Problem { Asset = "/Game/Chimera/Environment/MineableOre/BuildingOrePurityRecipeData", Reason = "extractor purity table not found or empty" });
        foreach (var (kind, count) in new[] { ("recipes", recipes.Count), ("recipe collections", collections.Count), ("items", items.Count), ("corporations", corps.Corporations.Count), ("buildings", buildings.Count) })
            if (count == 0) problems.Add(new Problem { Asset = kind, Reason = "none found" });
        var warnings = recipes.Where(r => r.BuildTime == null).Select(r => new Problem { Asset = r.Asset, Reason = $"no BuildTime in asset; default {Extractor.DefaultRecipeBuildTime}s applied" })
            .Concat(items.Where(i => !i.HasCdo || i.Icon == null).Select(i => new Problem { Asset = i.Asset, Reason = !i.HasCdo ? "no class default object" : "no ItemIcon" }))
            .ToList();

        var manifest = new Dictionary<string, object>
        {
            ["build"] = opt.Build,
            ["usmap"] = new { file = Path.GetFileName(opt.Usmap), changelist = usmapCl },
            ["gameChangelist"] = new { value = buildCl, source = buildClSource },
            ["engine"] = opt.Engine,
            ["tool"] = new
            {
                name = "game-extract",
                version = typeof(Program).Assembly.GetName().Version?.ToString(3),
                cue4parse = PackageVersion(typeof(CUE4Parse.FileProvider.DefaultFileProvider)),
                cue4parseConversion = PackageVersion(typeof(ETexturePlatform)),
                skiaSharp = PackageVersion(typeof(SKBitmap)),
                dotnet = Environment.Version.ToString(),
            },
            ["recipeDefaultBuildTimeSeconds"] = Extractor.DefaultRecipeBuildTime,
            ["guard"] = new
            {
                usmapBuildMismatch = mismatch,
                overridden = opt.AllowMismatch && mismatch.Count > 0,
                dataProblems = problems,
                status = problems.Count == 0 && mismatch.Count == 0 ? "ok" : (opt.AllowMismatch ? "overridden" : "failed"),
            },
            ["locales"] = new { exported = "en", available = locales },
            ["startedUtc"] = started.ToString("o"),
        };

        if (problems.Count > 0)
        {
            foreach (var p in problems.Take(50)) Console.Error.WriteLine("GUARD (data): " + p);
            if (problems.Count > 50) Console.Error.WriteLine($"... and {problems.Count - 50} more (see manifest.json)");
            if (!opt.AllowMismatch)
            {
                // Failed run: leave a manifest with the reasons, no data a pipeline could pick up by mistake.
                Directory.CreateDirectory(opt.Out);
                J.WriteFile(Path.Combine(opt.Out, "manifest.json"), manifest);
                Console.Error.WriteLine($"{problems.Count} problem(s); data NOT written. manifest.json lists them.");
                return 3;
            }
            Console.Error.WriteLine("--allow-mismatch given: writing the data anyway. It must not be published.");
        }

        var o = opt.Out;
        Directory.CreateDirectory(o);
        J.WriteFile(Path.Combine(o, "recipes.json"), recipes);
        J.WriteFile(Path.Combine(o, "recipe-collections.json"), collections);
        J.WriteFile(Path.Combine(o, "buildings.json"), buildings);
        J.WriteFile(Path.Combine(o, "extractor-rates.json"), rates);
        J.WriteFile(Path.Combine(o, "items.json"), items);
        J.WriteFile(Path.Combine(o, "corporations.json"), new
        {
            corporations = corps.Corporations,
            componentPoints = corps.ComponentTables,
            buildingCollections = corps.BuildingCollections,
        });
        J.WriteFile(Path.Combine(o, "localization", "en.json"), english);
        J.WriteFile(Path.Combine(o, "localization", "locales.json"), new { exported = "en", available = locales, source = "StringTable assets (English source text); other languages are .locres files that are not extracted" });

        var (itemIcons, itemFailed) = ExportIcons(ex, items.Select(i => i.Icon), Path.Combine(o, "icons", "items"));
        var (buildingIcons, buildingFailed) = ExportIcons(ex, buildings.Select(b => b.Icon), Path.Combine(o, "icons", "buildings"));
        foreach (var f in itemFailed.Concat(buildingFailed)) warnings.Add(f);

        manifest["counts"] = new SortedDictionary<string, int>
        {
            ["recipes"] = recipes.Count,
            ["recipesWithoutBuildTime"] = recipes.Count(r => r.BuildTime == null),
            ["recipeCollections"] = collections.Count,
            ["buildings"] = buildings.Count,
            ["buildingsWithPower"] = buildings.Count(b => b.Power != null && b.Power.HasElectricityTrait),
            ["extractorRates"] = rates.Count,
            ["items"] = items.Count,
            ["itemsWithIcon"] = items.Count(i => i.Icon != null),
            ["corporations"] = corps.Corporations.Count,
            ["corporationLevels"] = corps.Corporations.Sum(c => (c["levels"] as Newtonsoft.Json.Linq.JArray)?.Count ?? 0),
            ["componentPointRows"] = corps.ComponentTables.Values.Sum(t => t.Count),
            ["englishStringTables"] = english.Count,
            ["englishStrings"] = english.Values.Sum(t => t.Count),
            ["iconsItems"] = itemIcons,
            ["iconsBuildings"] = buildingIcons,
            ["locales"] = locales.Count,
        };
        manifest["warnings"] = warnings;
        manifest["finishedUtc"] = DateTime.UtcNow.ToString("o");
        J.WriteFile(Path.Combine(o, "manifest.json"), manifest);

        Console.WriteLine($"done: {recipes.Count} recipes, {collections.Count} collections, {buildings.Count} buildings, {items.Count} items, {corps.Corporations.Count} corporations, {itemIcons + buildingIcons} icons -> {Path.GetFullPath(o)}");
        return 0;
    }

    static string PackageVersion(Type t) =>
        t.Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? t.Assembly.GetName().Version?.ToString();

    static (int Count, List<Problem> Failed) ExportIcons(Extractor ex, IEnumerable<string> textures, string dir)
    {
        Directory.CreateDirectory(dir);
        var done = 0;
        var failed = new List<Problem>();
        foreach (var tex in textures.Where(t => t != null).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(t => t, StringComparer.Ordinal))
        {
            try
            {
                var texture = ex.LoadTexture(tex);
                using var bmp = texture.Decode(ETexturePlatform.DesktopMobile).ToSkBitmap();
                using var img = SKImage.FromBitmap(bmp);
                File.WriteAllBytes(Path.Combine(dir, tex[(tex.LastIndexOf('/') + 1)..] + ".png"), img.Encode(SKEncodedImageFormat.Png, 100).ToArray());
                done++;
            }
            catch (Exception e)
            {
                failed.Add(new Problem { Asset = tex, Reason = $"icon export failed: {e.GetType().Name}: {e.Message}" });
            }
        }
        return (done, failed);
    }
}
