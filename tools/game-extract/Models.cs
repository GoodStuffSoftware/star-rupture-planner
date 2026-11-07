using Newtonsoft.Json.Linq;

namespace GameExtract;

// Plain records written (camelCase) to the raw JSON files. Asset paths are "/Game/..." package paths
// without the ".N" object index, e.g. "/Game/Chimera/Items/I_Accumulator".

public sealed class ItemCount
{
    public string Item { get; set; }
    public int Count { get; set; }
}

public sealed class RecipeRec
{
    public string Asset { get; set; }
    public string Id { get; set; }
    /// <summary>Folder below /Game/Chimera/Crafting, "" for the root.</summary>
    public string Folder { get; set; }
    public string DisplayName { get; set; }
    public int? Level { get; set; }
    public string UnlockType { get; set; }
    public ItemCount Output { get; set; }
    public List<ItemCount> Inputs { get; set; } = new();
    /// <summary>BuildTime as stored in the asset; null when the asset omits it.</summary>
    public double? BuildTime { get; set; }
    /// <summary>BuildTime, or <see cref="Extractor.DefaultRecipeBuildTime"/> when the asset omits it.</summary>
    public double BuildTimeEffective { get; set; }
    public bool BuildTimeDefaulted { get; set; }
    public string Icon { get; set; }
}

public sealed class RecipeCollectionRec
{
    public string Asset { get; set; }
    public string Id { get; set; }
    public List<string> Recipes { get; set; } = new();
    /// <summary>Building config (DA_) assets whose crafting trait points at this collection.</summary>
    public List<string> UsedByBuildings { get; set; } = new();
}

public sealed class PowerRec
{
    public bool HasElectricityTrait { get; set; }
    /// <summary>ElectricityValue; 0 when the trait exists but the value is omitted (default).</summary>
    public double ElectricityValue { get; set; }
    public bool ElectricityValuePresent { get; set; }
    public string Type { get; set; }
}

public sealed class BuildingRec
{
    public string Id { get; set; }
    public string Asset { get; set; }
    public string ConfigAsset { get; set; }
    public string UniqueName { get; set; }
    public string BuildingId { get; set; }
    public string DisplayName { get; set; }
    public string Description { get; set; }
    public string Type { get; set; }
    public string UiType { get; set; }
    public string UiSubType { get; set; }
    public string Corporation { get; set; }
    public bool IsExtractor { get; set; }
    public string ActorClass { get; set; }
    public string Icon { get; set; }
    public List<ItemCount> ResourceRequirements { get; set; } = new();
    public double? StabilityCost { get; set; }
    public PowerRec Power { get; set; }
    /// <summary>CoolingCapacityUsing from CrMassTemperatureTrait (the planner's "heat"); null when no such trait.</summary>
    public double? Heat { get; set; }
    public JToken TemperatureParameters { get; set; }
    public JToken Crafting { get; set; }
    public List<string> RecipeCollections { get; set; } = new();
    /// <summary>Tier read from a "TierN" suffix in the building id (the game has no explicit tier field); null when absent.</summary>
    public int? Tier { get; set; }
    /// <summary>The building id with the "TierN" suffix removed, when Tier is set.</summary>
    public string BaseBuilding { get; set; }
    public string QuickSelectBuildingReplace { get; set; }
    public List<UnlockRec> UnlockedBy { get; set; } = new();
    /// <summary>Config-asset parents followed to find inherited traits.</summary>
    public List<string> ConfigParents { get; set; } = new();
    public bool PowerInherited { get; set; }
    public List<JObject> Traits { get; set; } = new();
}

public sealed class UnlockRec
{
    public string Corporation { get; set; }
    public int Level { get; set; }
    public string Via { get; set; }
}

public sealed class ItemRec
{
    public string Id { get; set; }
    public string Asset { get; set; }
    public string UniqueItemName { get; set; }
    public string DisplayName { get; set; }
    public string DisplayNameKey { get; set; }
    public string Description { get; set; }
    public string ParentClass { get; set; }
    public string UiItemType { get; set; }
    public string StackingType { get; set; }
    public int? MaxStack { get; set; }
    public string Icon { get; set; }
    public bool HasCdo { get; set; }
}

public sealed class ExtractorRateRec
{
    public string ExtractorActor { get; set; }
    public string Building { get; set; }
    public string Resource { get; set; }
    public string Purity { get; set; }
    public string Recipe { get; set; }
    public int? OutputCount { get; set; }
    public double? BuildTimeEffective { get; set; }
    /// <summary>OutputCount * 60 / BuildTimeEffective; informational, the converter owns the final maths.</summary>
    public double? PerMinute { get; set; }
}

public sealed class Problem
{
    public string Asset { get; set; }
    public string Reason { get; set; }
    public override string ToString() => $"{Asset}: {Reason}";
}
