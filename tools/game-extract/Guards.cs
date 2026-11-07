using System.Diagnostics;
using System.Text.RegularExpressions;

namespace GameExtract;

/// <summary>
/// Guard 1: the .usmap must belong to the game build. A usmap from another build does not throw, it silently
/// drops fields, so the changelist (CL) of the usmap is compared with the CL of the installed game.
/// </summary>
public static class UsmapGuard
{
    // "5.6.1-127004+++Earth20+Neon-StarRupture-Client.usmap" -> 127004 (engine version, "-", CL, "+++branch").
    static readonly Regex NameCl = new(@"-(\d{5,})\+\+\+", RegexOptions.Compiled);
    // "CL127004" in the file name or in its folder name (older usmaps are "CL118258/Client.usmap").
    static readonly Regex LooseCl = new(@"CL[-_]?(\d{5,})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    // "+++Earth20+Neon-CL-127004" in the game exe's version resource.
    static readonly Regex ExeCl = new(@"CL[-_]?(\d{5,})", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>Changelist of a usmap from its file name, else from its parent folder name; null if neither carries one.</summary>
    public static int? UsmapChangelist(string usmapPath)
    {
        var file = Path.GetFileName(usmapPath);
        var m = NameCl.Match(file);
        if (!m.Success) m = LooseCl.Match(file);
        if (!m.Success)
        {
            var dir = Path.GetFileName(Path.GetDirectoryName(Path.GetFullPath(usmapPath)) ?? "");
            m = LooseCl.Match(dir ?? "");
        }
        return m.Success ? int.Parse(m.Groups[1].Value) : null;
    }

    /// <summary>Changelist out of a version string such as "++Earth20+Neon-CL-127004".</summary>
    public static int? ChangelistFromVersionString(string version)
    {
        if (string.IsNullOrEmpty(version)) return null;
        var m = ExeCl.Match(version);
        return m.Success ? int.Parse(m.Groups[1].Value) : null;
    }

    /// <summary>
    /// Changelist of the installed game: the Windows version resource of the shipping exe (ProductVersion
    /// "+++Earth20+Neon-CL-127004"), else a "CL&lt;digits&gt;" marker file in the install root.
    /// </summary>
    public static (int? Cl, string Source) BuildChangelist(string paksDir)
    {
        var dir = new DirectoryInfo(Path.GetFullPath(paksDir));
        for (var i = 0; i < 5 && dir != null; i++, dir = dir.Parent)
        {
            var bin = Path.Combine(dir.FullName, "Binaries", "Win64");
            if (Directory.Exists(bin))
            {
                foreach (var exe in Directory.GetFiles(bin, "*-Shipping.exe"))
                {
                    var vi = FileVersionInfo.GetVersionInfo(exe);
                    foreach (var s in new[] { vi.ProductVersion, vi.FileVersion })
                    {
                        var cl = ChangelistFromVersionString(s);
                        if (cl != null) return (cl, $"{Path.GetFileName(exe)} version resource \"{s}\"");
                    }
                }
            }
            foreach (var entry in Directory.GetFileSystemEntries(dir.FullName, "CL*"))
            {
                var name = Path.GetFileName(entry);
                if (Regex.IsMatch(name, @"^CL\d{5,}$"))
                    return (int.Parse(name[2..]), $"marker \"{name}\" in {dir.FullName}");
            }
        }
        return (null, "no shipping exe version resource and no CL marker found above the paks folder");
    }

    /// <summary>
    /// Steam buildid from the appmanifest_*.acf of this install: in the steamapps folder above the paks, the manifest
    /// whose installdir is the folder under steamapps/common that holds the paks. Null when not found.
    /// </summary>
    public static (string BuildId, string File) AppManifestBuildId(string paksDir)
    {
        var dir = new DirectoryInfo(Path.GetFullPath(paksDir));
        string installDir = null;
        for (var i = 0; i < 8 && dir != null; i++, dir = dir.Parent)
        {
            if (dir.Parent != null && dir.Parent.Name.Equals("common", StringComparison.OrdinalIgnoreCase)) installDir = dir.Name;
            if (!dir.Name.Equals("steamapps", StringComparison.OrdinalIgnoreCase) || installDir == null) continue;
            foreach (var f in Directory.GetFiles(dir.FullName, "appmanifest_*.acf"))
            {
                var text = File.ReadAllText(f);
                var inst = Regex.Match(text, "\"installdir\"\\s+\"([^\"]*)\"");
                var build = Regex.Match(text, "\"buildid\"\\s+\"(\\d+)\"");
                if (inst.Success && build.Success && inst.Groups[1].Value.Equals(installDir, StringComparison.OrdinalIgnoreCase))
                    return (build.Groups[1].Value, f);
            }
        }
        return (null, null);
    }

    /// <summary>Returns the reasons the usmap/build pair is not trustworthy; empty when it is fine.</summary>
    public static List<string> Check(string usmapPath, string paksDir, string buildArg)
    {
        var problems = new List<string>();
        var usmapCl = UsmapChangelist(usmapPath);
        var (buildCl, source) = BuildChangelist(paksDir);
        if (usmapCl == null)
            problems.Add($"usmap changelist unknown: neither the file name nor its folder name carries one ({usmapPath}). Name it like 5.6.1-<CL>+++<branch>-....usmap or put it in a CL<digits> folder.");
        if (buildCl == null)
            problems.Add($"game build changelist unknown: {source}");
        if (usmapCl != null && buildCl != null && usmapCl != buildCl)
            problems.Add($"usmap is for CL{usmapCl} but the game build is CL{buildCl} ({source}). A usmap from another changelist silently drops fields.");
        var (manifestBuild, manifestFile) = AppManifestBuildId(paksDir);
        if (manifestBuild != null && manifestBuild != buildArg)
            problems.Add($"--build {buildArg} does not match buildid {manifestBuild} in {manifestFile}");
        return problems;
    }
}

/// <summary>
/// Guard 2: the extracted data must have the fields the planner needs. A wrong usmap makes whole fields vanish
/// (all recipes lose output, inputs and time), so the check runs on the data itself.
/// </summary>
public static class DataGuard
{
    /// <summary>
    /// Healthy CL127004 data has 10 of 257 recipes (3.9 percent) without an explicit BuildTime (they use the class
    /// default). A wrong usmap drops it from all of them. Above this share the missing times are treated as a failure.
    /// </summary>
    public const double MaxMissingTimeShare = 0.15;

    /// <summary>
    /// Recipes allowed to have no inputs: those in an extractor building's recipe collection or in the purity table,
    /// plus every recipe sharing a (non-root) folder with one of those (the game keeps each drill's recipes together,
    /// including unreferenced ones such as the laser drill's per-purity ore recipes).
    /// </summary>
    public static ISet<string> ExtractorRecipes(IReadOnlyList<RecipeRec> recipes, IReadOnlyList<RecipeCollectionRec> collections,
        IReadOnlyList<BuildingRec> buildings, IReadOnlyList<ExtractorRateRec> rates)
    {
        var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var col in collections)
            if (buildings.Any(b => b.IsExtractor && b.RecipeCollections.Contains(col.Asset)))
                foreach (var r in col.Recipes) known.Add(r);
        foreach (var r in rates) if (r.Recipe != null) known.Add(r.Recipe);
        var folders = recipes.Where(r => known.Contains(r.Asset) && !string.IsNullOrEmpty(r.Folder)).Select(r => r.Folder).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var r in recipes.Where(r => folders.Contains(r.Folder))) known.Add(r.Asset);
        return known;
    }

    /// <summary>
    /// Recipes: every recipe needs an output item with a count. Inputs may be empty only for extractor recipes
    /// (recipes listed in an extractor building's collection or in the purity table). A missing BuildTime is
    /// accepted for isolated recipes (default applies) but fails when more than <see cref="MaxMissingTimeShare"/>
    /// of all recipes lack it, listing every one.
    /// </summary>
    public static List<Problem> CheckRecipes(IReadOnlyList<RecipeRec> recipes, ISet<string> extractorRecipes)
    {
        var problems = new List<Problem>();
        foreach (var r in recipes)
        {
            if (r.Output == null || string.IsNullOrEmpty(r.Output.Item) || r.Output.Count <= 0)
                problems.Add(new Problem { Asset = r.Asset, Reason = "missing OutputItem" });
            if (r.Inputs.Count == 0 && !extractorRecipes.Contains(r.Asset))
                problems.Add(new Problem { Asset = r.Asset, Reason = "missing NeededResources (and not an extractor recipe)" });
        }
        var noTime = recipes.Where(r => r.BuildTime == null).ToList();
        if (recipes.Count > 0 && (double)noTime.Count / recipes.Count > MaxMissingTimeShare)
            problems.AddRange(noTime.Select(r => new Problem
            {
                Asset = r.Asset,
                Reason = $"missing BuildTime ({noTime.Count} of {recipes.Count} recipes lack it, limit {MaxMissingTimeShare:P0})",
            }));
        return problems;
    }

    /// <summary>The BD types that are production machines and therefore must declare power use.</summary>
    static readonly HashSet<string> PoweredTypes = new()
    {
        "ECrBuildingType::Crafting", "ECrBuildingType::RawMaterialProcessing",
        "ECrBuildingType::Extraction", "ECrBuildingType::TemperatureManagement",
    };

    /// <summary>
    /// Buildings: a production building (powered type, and it crafts or is an extractor) must have an electricity trait
    /// with a power value. Habitat interiors (Analyzer, Food Processor, ...) have none by design and are not checked.
    /// </summary>
    public static List<Problem> CheckBuildings(IReadOnlyList<BuildingRec> buildings)
    {
        var problems = new List<Problem>();
        foreach (var b in buildings)
        {
            var production = b.Type != null && PoweredTypes.Contains(b.Type) && (b.IsExtractor || b.RecipeCollections.Count > 0);
            if (!production) continue;
            if (b.Power == null || !b.Power.HasElectricityTrait)
                problems.Add(new Problem { Asset = b.Asset, Reason = "missing power data: no CrElectricityTrait" });
            else if (!b.Power.ElectricityValuePresent)
                problems.Add(new Problem { Asset = b.Asset, Reason = "missing power data: CrElectricityTrait has no ElectricityValue" });
        }
        return problems;
    }
}
