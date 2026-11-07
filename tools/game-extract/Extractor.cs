using System.Text.RegularExpressions;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace GameExtract;

/// <summary>Reads the paks through CUE4Parse and turns the game assets into the raw record types.</summary>
public sealed class Extractor
{
    /// <summary>
    /// BuildTime of a CrItemRecipeData that omits it. Unversioned UE properties leave default values out of the
    /// asset, so the default is not in the data. 10 seconds is what reproduces the planner's update2_QoL numbers
    /// for the 10 recipes without BuildTime (spike, 2026-11-07); it is a rule, not a value read from the game.
    /// </summary>
    public const double DefaultRecipeBuildTime = 10.0;

    // Trait exports that only describe visuals, placement or AI; left out of buildings.json to keep it readable.
    static readonly string[] CosmeticTraitMarkers =
    {
        "RepVis", "Niagara", "Aggro", "EntityGrid", "LogisticsSockets", "AssortedFragments", "Infection",
        "LODCollector", "Replication", "RotationEffect", "WalkwayConnection",
    };

    readonly DefaultFileProvider provider;
    // "/Game/Chimera/Items/I_X" -> provider file key "StarRupture/Content/Chimera/Items/I_X.uasset"
    readonly Dictionary<string, string> gameToKey = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, JArray> packageCache = new(StringComparer.OrdinalIgnoreCase);

    public List<Problem> LoadErrors { get; } = new();
    public int MountedContainers { get; private set; }
    public int FileCount => provider.Files.Count;

    public Extractor(string paksDir, string usmapPath, EGame game)
    {
        provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly, new VersionContainer(game));
        provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
        provider.Initialize();
        // The game ships unencrypted; an all-zero key just mounts the containers.
        MountedContainers = provider.SubmitKey(new FGuid(), new FAesKey(new byte[32]));
        foreach (var key in provider.Files.Keys)
        {
            if (!key.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase)) continue;
            const string root = "StarRupture/Content/";
            if (!key.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
            gameToKey["/Game/" + key[root.Length..^".uasset".Length]] = key;
        }
    }

    public IReadOnlyList<string> Packages(string regex)
    {
        var rx = new Regex(regex, RegexOptions.IgnoreCase);
        return gameToKey.Keys.Where(k => rx.IsMatch(k)).OrderBy(k => k, StringComparer.Ordinal).ToList();
    }

    public IEnumerable<string> FileKeys => provider.Files.Keys;

    /// <summary>All exports of a package as JSON; null (and a recorded load error) when it fails to load.</summary>
    public JArray Load(string gamePath)
    {
        if (packageCache.TryGetValue(gamePath, out var cached)) return cached;
        JArray result = null;
        if (gameToKey.TryGetValue(gamePath, out var key))
        {
            try
            {
                var exports = provider.LoadPackage(key).GetExports().ToList();
                result = JArray.Parse(JsonConvert.SerializeObject(exports));
            }
            catch (Exception ex)
            {
                LoadErrors.Add(new Problem { Asset = gamePath, Reason = $"load failed: {ex.GetType().Name}: {ex.Message}" });
            }
        }
        packageCache[gamePath] = result;
        return result;
    }

    public CUE4Parse.UE4.Assets.Exports.Texture.UTexture2D LoadTexture(string gamePath)
    {
        var name = gamePath[(gamePath.LastIndexOf('/') + 1)..];
        return provider.LoadPackageObject<CUE4Parse.UE4.Assets.Exports.Texture.UTexture2D>($"{gamePath}.{name}");
    }

    static JObject Export(JArray pkg, string type) =>
        pkg?.OfType<JObject>().FirstOrDefault(e => e["Type"]?.Value<string>() == type);

    static JObject Props(JObject export) => export?["Properties"] as JObject;

    // ---------------------------------------------------------------- recipes

    public List<RecipeRec> Recipes()
    {
        var list = new List<RecipeRec>();
        foreach (var path in Packages(@"^/Game/Chimera/Crafting/(.*/)?CR_[^/]*$"))
        {
            var p = Props(Export(Load(path), "CrItemRecipeData"));
            if (p == null) { LoadErrors.Add(new Problem { Asset = path, Reason = "no CrItemRecipeData export" }); continue; }
            var id = path[(path.LastIndexOf('/') + 1)..];
            var folder = path["/Game/Chimera/Crafting/".Length..];
            folder = folder.Contains('/') ? folder[..folder.LastIndexOf('/')] : "";
            var time = J.Num(p["BuildTime"]);
            var outItem = p["OutputItem"];
            list.Add(new RecipeRec
            {
                Asset = path,
                Id = id,
                Folder = folder,
                DisplayName = J.Text(p["DisplayText"]),
                Level = J.Int(p["Level"]),
                UnlockType = J.Str(p["UnlockType"]),
                Output = outItem == null ? null : new ItemCount { Item = J.Asset(outItem["Item"]), Count = J.Int(outItem["Count"]) ?? 0 },
                Inputs = J.ItemCounts(p["NeededResources"]),
                BuildTime = time,
                BuildTimeEffective = time ?? DefaultRecipeBuildTime,
                BuildTimeDefaulted = time == null,
                Icon = J.Asset(p["Icon"]?["ResourceObject"]),
            });
        }
        return list;
    }

    public List<RecipeCollectionRec> RecipeCollections()
    {
        var list = new List<RecipeCollectionRec>();
        foreach (var path in Packages(@"^/Game/Chimera/Crafting/(.*/)?CRC_[^/]*$"))
        {
            var export = Export(Load(path), "CrItemRecipeCollection");
            if (export == null) { LoadErrors.Add(new Problem { Asset = path, Reason = "no CrItemRecipeCollection export" }); continue; }
            // An empty collection (placeholder buildings) has no Properties at all.
            var p = Props(export);
            list.Add(new RecipeCollectionRec
            {
                Asset = path,
                Id = path[(path.LastIndexOf('/') + 1)..],
                Recipes = (p?["Recipes"] as JArray ?? new JArray()).Select(J.Asset).Where(a => a != null).ToList(),
            });
        }
        return list;
    }

    // ---------------------------------------------------------------- items

    public List<ItemRec> Items()
    {
        var list = new List<ItemRec>();
        foreach (var path in Packages(@"^/Game/Chimera/Items/(.*/)?I_[^/]*$"))
        {
            var pkg = Load(path);
            if (pkg == null) continue;
            var cls = pkg.OfType<JObject>().FirstOrDefault(e => e["Type"]?.Value<string>() == "BlueprintGeneratedClass");
            // Data lives on the class default object export, "Default__I_X_C".
            var cdo = pkg.OfType<JObject>().FirstOrDefault(e => (e["Name"]?.Value<string>() ?? "").StartsWith("Default__"));
            var p = Props(cdo);
            var parent = cls?["SuperStruct"]?["ObjectName"]?.Value<string>();
            if (parent != null) parent = Regex.Replace(parent, @"^Class'(.*)'$", "$1");
            var icon = p?["ItemIcon"]?["ResourceObject"];
            list.Add(new ItemRec
            {
                Id = path[(path.LastIndexOf('/') + 1)..],
                Asset = path,
                UniqueItemName = J.Str(p?["UniqueItemName"]),
                DisplayName = J.Text(p?["ItemName"]),
                DisplayNameKey = J.TextKey(p?["ItemName"]),
                Description = J.Text(p?["ItemDescription"]),
                ParentClass = parent,
                UiItemType = J.Str(p?["UIItemType"]),
                StackingType = J.Str(p?["StackingType"]),
                MaxStack = J.Int(p?["MaxStack"]),
                Icon = J.Asset(icon),
                HasCdo = p != null,
            });
        }
        return list;
    }

    // ---------------------------------------------------------------- corporations

    public sealed class CorporationData
    {
        public List<JObject> Corporations { get; } = new();
        public Dictionary<string, List<JObject>> ComponentTables { get; } = new();
        public Dictionary<string, JToken> BuildingCollections { get; } = new();
    }

    public CorporationData Corporations()
    {
        var data = new CorporationData();
        foreach (var path in Packages(@"^/Game/Chimera/Corporations/CD_[^/]*$"))
        {
            var p = Props(Export(Load(path), "CrCorporationData"));
            if (p == null) { LoadErrors.Add(new Problem { Asset = path, Reason = "no CrCorporationData export" }); continue; }
            var levels = new JArray();
            foreach (var lv in p["Levels"] as JArray ?? new JArray())
            {
                var s = (JObject)J.Simplify(lv);
                s["xp"] = lv["ReputationRequired"]; // the planner calls ReputationRequired "xp"
                levels.Add(s);
            }
            var color = p["CorporationColor"]?["Hex"]?.Value<string>();
            data.Corporations.Add(new JObject
            {
                ["asset"] = path,
                ["id"] = path[(path.LastIndexOf('/') + 1)..],
                ["name"] = J.Str(p["Name"]),
                ["displayName"] = J.Text(p["DisplayText"]),
                ["displayNameKey"] = J.TextKey(p["DisplayText"]),
                ["description"] = J.Text(p["Description"]),
                ["colorHex"] = color,
                ["icon"] = J.Asset(p["Icon"]?["ResourceObject"]),
                ["buttonIcon"] = J.Asset(p["ButtonIcon"]),
                ["levels"] = levels,
            });
        }
        // Component points live in DataTables next to the corporations (CrExporterItemRow: Item, Level, <Corp>Value).
        foreach (var path in Packages(@"^/Game/Chimera/Corporations/[^/]*$"))
        {
            var table = Export(Load(path), "DataTable");
            if (table?["Rows"] is not JObject rows) continue;
            var list = new List<JObject>();
            foreach (var row in rows.Properties())
            {
                var r = (JObject)J.Simplify(row.Value);
                r.AddFirst(new JProperty("row", row.Name));
                list.Add(r);
            }
            data.ComponentTables[path[(path.LastIndexOf('/') + 1)..]] = list;
        }
        // Building collections referenced as corporation rewards.
        foreach (var path in Packages(@"^/Game/Chimera/Corporations/BuildingCollections/[^/]*$"))
        {
            var pkg = Load(path);
            var e = pkg?.OfType<JObject>().FirstOrDefault(x => x["Properties"] != null && (x["Name"]?.Value<string>() ?? "") == path[(path.LastIndexOf('/') + 1)..]);
            if (e != null) data.BuildingCollections[path] = J.Simplify(e["Properties"]);
        }
        return data;
    }

    // ---------------------------------------------------------------- buildings

    public List<BuildingRec> Buildings(CorporationData corps)
    {
        // building asset (BD_) -> every (corporation, level, via) that rewards it
        var unlocks = new Dictionary<string, List<UnlockRec>>();
        void AddUnlock(string bd, string corp, int level, string via)
        {
            if (bd == null) return;
            if (!unlocks.TryGetValue(bd, out var l)) unlocks[bd] = l = new List<UnlockRec>();
            l.Add(new UnlockRec { Corporation = corp, Level = level, Via = via });
        }
        foreach (var c in corps.Corporations)
        foreach (var lv in c["levels"] as JArray ?? new JArray())
        {
            var level = lv["Level"]?.Value<int>() ?? 0;
            var corp = c["id"].Value<string>();
            foreach (var bd in lv["BuildingRewards"] as JArray ?? new JArray()) AddUnlock(bd.Value<string>(), corp, level, "BuildingRewards");
            foreach (var col in lv["BuildingCollectionRewards"] as JArray ?? new JArray())
            {
                var colPath = col.Value<string>();
                if (colPath != null && corps.BuildingCollections.TryGetValue(colPath, out var content))
                    foreach (var s in content.SelectTokens("$..*").OfType<JValue>().Select(v => v.Value as string).Where(s => s != null && Regex.IsMatch(s, @"/BD_[^/]*$")))
                        AddUnlock(s, corp, level, "BuildingCollectionRewards:" + colPath[(colPath.LastIndexOf('/') + 1)..]);
            }
        }

        var list = new List<BuildingRec>();
        foreach (var path in Packages(@"^/Game/Chimera/Buildings/(.*/)?BD_[^/]*$"))
        {
            var p = Props(Export(Load(path), "CrBuildingData"));
            if (p == null) { LoadErrors.Add(new Problem { Asset = path, Reason = "no CrBuildingData export" }); continue; }
            var id = path[(path.LastIndexOf('/') + 1)..];
            var configAsset = J.Asset(p["EntityType"]?["EntityConfig"]);
            var rec = new BuildingRec
            {
                Id = id,
                Asset = path,
                ConfigAsset = configAsset,
                UniqueName = J.Str(p["BuldingUniqueName"]),
                BuildingId = J.Str(p["BuildingID"]),
                DisplayName = J.Text(p["BuildingName"]),
                Description = J.Text(p["BuildingDescription"]),
                Type = J.Str(p["Type"]),
                UiType = J.Str(p["UIType"]),
                UiSubType = J.Str(p["UISubType"]),
                Corporation = J.Str(p["UIBuildingCorporation"]),
                IsExtractor = p["IsExtractor"]?.Value<bool>() ?? false,
                ActorClass = J.Asset(p["ActorClass"]),
                Icon = J.Asset(p["Icon"]?["ResourceObject"]),
                ResourceRequirements = J.ItemCounts(p["ResourceRequirements"]?["Requirements"], "Item", "Quantity"),
                StabilityCost = J.Num(p["StabilityCost"]),
                QuickSelectBuildingReplace = J.Asset(p["QuickSelectBuildingReplace"]),
            };
            if (unlocks.TryGetValue(path, out var u)) rec.UnlockedBy = u;
            FillConfig(rec);
            list.Add(rec);
        }

        // Tier: no explicit field in the data; read it from the id convention (X, XTier2, XTier3 ...).
        var ids = list.Select(b => b.Id).ToHashSet();
        foreach (var b in list)
        {
            var m = Regex.Match(b.Id, @"^BD_(.+?)Tier(\d+)(_.*|[Vv]ariant.*)?$");
            if (m.Success) { b.Tier = int.Parse(m.Groups[2].Value); b.BaseBuilding = "BD_" + m.Groups[1].Value; }
            else if (list.Any(o => o.Id.StartsWith(b.Id + "Tier", StringComparison.Ordinal))) { b.Tier = 1; b.BaseBuilding = b.Id; }
        }
        return list;
    }

    void FillConfig(BuildingRec rec)
    {
        if (rec.ConfigAsset == null) return;
        // The config asset plus its parent configs (Config.Parent); own traits win over inherited ones.
        var chain = new List<(string Asset, JArray Pkg)>();
        var current = rec.ConfigAsset;
        for (var depth = 0; current != null && depth < 6; depth++)
        {
            var pkg = Load(current);
            if (pkg == null) break;
            chain.Add((current, pkg));
            var cfg = pkg.OfType<JObject>().FirstOrDefault(e => e["Properties"]?["Config"]?["Parent"] != null);
            current = J.Asset(cfg?["Properties"]?["Config"]?["Parent"]);
        }
        if (chain.Count == 0) return;
        rec.ConfigParents = chain.Skip(1).Select(c => c.Asset).ToList();

        JObject FindTrait(string type, out bool inherited)
        {
            inherited = false;
            for (var i = 0; i < chain.Count; i++)
            {
                var t = Export(chain[i].Pkg, type);
                if (t != null) { inherited = i > 0; return t; }
            }
            return null;
        }

        var el = FindTrait("CrElectricityTrait", out var elInherited);
        var elParams = Props(el)?["Parameters"];
        rec.Power = new PowerRec
        {
            HasElectricityTrait = el != null,
            ElectricityValuePresent = elParams?["ElectricityValue"] != null,
            ElectricityValue = J.Num(elParams?["ElectricityValue"]) ?? 0,
            Type = J.Str(elParams?["Type"]),
        };
        rec.PowerInherited = el != null && elInherited;

        var temp = FindTrait("CrMassTemperatureTrait", out _);
        if (temp != null)
        {
            var tp = Props(temp)?["TemperatureParameters"];
            rec.TemperatureParameters = tp == null ? new JObject() : J.Simplify(tp);
            rec.Heat = J.Num(tp?["CoolingCapacityUsing"]) ?? 0;
        }

        foreach (var craft in chain[0].Pkg.OfType<JObject>().Where(e => e["Type"]?.Value<string>() == "CrBuildingCraftingTrait"))
        {
            var cp = Props(craft)?["CraftingParameters"];
            var col = J.Asset(cp?["RecipeCollection"]);
            if (col != null) rec.RecipeCollections.Add(col);
            rec.Crafting ??= J.Simplify(cp);
        }

        // Own traits, minus the cosmetic ones.
        foreach (var e in chain[0].Pkg.OfType<JObject>())
        {
            var type = e["Type"]?.Value<string>() ?? "";
            if (!type.EndsWith("Trait", StringComparison.Ordinal)) continue;
            if (CosmeticTraitMarkers.Any(m => type.Contains(m))) continue;
            rec.Traits.Add(new JObject
            {
                ["type"] = type,
                ["name"] = e["Name"],
                ["properties"] = e["Properties"] == null ? null : J.Simplify(e["Properties"]),
            });
        }
    }

    // ---------------------------------------------------------------- extractor rates

    /// <summary>
    /// The tier/purity multipliers of drills are not in the recipe collection of the building: each (extractor,
    /// resource, purity) has its own recipe asset, chosen through Environment/MineableOre/BuildingOrePurityRecipeData.
    /// </summary>
    public (List<ExtractorRateRec> Rates, bool TableFound) ExtractorRates(IReadOnlyList<RecipeRec> recipes, IReadOnlyList<BuildingRec> buildings)
    {
        var byRecipe = recipes.ToDictionary(r => r.Asset, StringComparer.OrdinalIgnoreCase);
        var byActor = buildings.Where(b => b.ActorClass != null).GroupBy(b => b.ActorClass, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Asset, StringComparer.OrdinalIgnoreCase);
        var tablePath = Packages(@"/MineableOre/BuildingOrePurityRecipeData$").FirstOrDefault();
        var rates = new List<ExtractorRateRec>();
        if (tablePath == null) return (rates, false);
        var possible = Props(Export(Load(tablePath), "CrBuildingOrePurityRecipeData"))?["PossibleRecipes"] as JArray;
        if (possible == null) return (rates, false);
        foreach (var e in possible)
        {
            var actor = J.Asset(e["ExtractorType"]);
            var recipeAsset = J.Asset(e["Recipe"]);
            byRecipe.TryGetValue(recipeAsset ?? "", out var recipe);
            var count = recipe?.Output?.Count;
            rates.Add(new ExtractorRateRec
            {
                ExtractorActor = actor,
                Building = actor != null && byActor.TryGetValue(actor, out var bd) ? bd : null,
                Resource = J.Asset(e["Resource"]),
                Purity = J.Str(e["PurityLevel"]),
                Recipe = recipeAsset,
                OutputCount = count,
                BuildTimeEffective = recipe?.BuildTimeEffective,
                PerMinute = count != null && recipe != null && recipe.BuildTimeEffective > 0 ? Math.Round(count.Value * 60.0 / recipe.BuildTimeEffective, 4) : null,
            });
        }
        return (rates, true);
    }

    // ---------------------------------------------------------------- localization

    /// <summary>English strings: every StringTable asset, as { table: { key: text } }.</summary>
    public SortedDictionary<string, SortedDictionary<string, string>> EnglishStrings()
    {
        var result = new SortedDictionary<string, SortedDictionary<string, string>>(StringComparer.Ordinal);
        foreach (var path in Packages(@"^/Game/Chimera/Localization/StringTables/[^/]*$"))
        {
            var st = Export(Load(path), "StringTable")?["StringTable"];
            if (st?["KeysToEntries"] is not JObject entries) continue;
            // Keyed by table id ("/Game/Chimera/Localization/StringTables/Items.Items"), the form FText references use.
            var name = path[(path.LastIndexOf('/') + 1)..];
            var table = new SortedDictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in entries.Properties()) table[kv.Name] = kv.Value.Value<string>();
            result[$"{path}.{name}"] = table;
        }
        return result;
    }

    /// <summary>Languages with a Game.locres in the paks (these are not extracted, only listed).</summary>
    public List<string> AvailableLocales()
    {
        var rx = new Regex(@"(^|/)Content/Localization/Game/([^/]+)/Game\.locres$", RegexOptions.IgnoreCase);
        return FileKeys.Select(k => rx.Match(k)).Where(m => m.Success).Select(m => m.Groups[2].Value)
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.Ordinal).ToList();
    }
}
