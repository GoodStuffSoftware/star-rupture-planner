using GameExtract;
using Xunit;

namespace GameExtract.Tests;

public class UsmapGuardTests
{
    [Theory]
    [InlineData("5.6.1-127004+++Earth20+Neon-StarRupture-Client.usmap", 127004)]
    [InlineData("C:/x/usmap/CL118258/Client.usmap", 118258)]
    [InlineData("5.6.1-121391+++Earth20+Release-CU1-StarRupture-CLIENT.usmap", 121391)]
    public void UsmapChangelistIsReadFromFileOrFolderName(string path, int expected) =>
        Assert.Equal(expected, UsmapGuard.UsmapChangelist(path));

    [Fact]
    public void UsmapWithoutChangelistIsUnknown() =>
        Assert.Null(UsmapGuard.UsmapChangelist("C:/somewhere/mappings.usmap"));

    [Theory]
    [InlineData("++Earth20+Neon-CL-127004", 127004)]
    [InlineData("++Earth20+Release-CU1-CL-121391", 121391)]
    [InlineData("1.0.0.0", null)]
    [InlineData(null, null)]
    public void ChangelistIsReadFromExeVersionString(string version, int? expected) =>
        Assert.Equal(expected, UsmapGuard.ChangelistFromVersionString(version));
}

public class DataGuardTests
{
    static RecipeRec Recipe(string id, double? time = 6, bool output = true, int inputs = 1, string folder = "") => new()
    {
        Asset = "/Game/Chimera/Crafting/" + (folder == "" ? "" : folder + "/") + id,
        Id = id,
        Folder = folder,
        BuildTime = time,
        BuildTimeEffective = time ?? Extractor.DefaultRecipeBuildTime,
        Output = output ? new ItemCount { Item = "/Game/Chimera/Items/I_X", Count = 1 } : null,
        Inputs = Enumerable.Range(0, inputs).Select(_ => new ItemCount { Item = "/Game/Chimera/Items/I_Y", Count = 1 }).ToList(),
    };

    static readonly ISet<string> NoExtractors = new HashSet<string>();

    [Fact]
    public void HealthyRecipesPass()
    {
        var recipes = Enumerable.Range(0, 30).Select(i => Recipe("CR_" + i)).ToList();
        recipes[3] = Recipe("CR_NoTime", time: null); // one recipe on the class default is normal
        Assert.Empty(DataGuard.CheckRecipes(recipes, NoExtractors));
    }

    [Fact]
    public void RecipeWithoutOutputIsListed()
    {
        var recipes = new List<RecipeRec> { Recipe("CR_Ok"), Recipe("CR_NoOutput", output: false) };
        var problems = DataGuard.CheckRecipes(recipes, NoExtractors);
        var p = Assert.Single(problems);
        Assert.EndsWith("CR_NoOutput", p.Asset);
    }

    [Fact]
    public void InputlessRecipeIsOkOnlyForExtractors()
    {
        var drill = Recipe("CR_Ore", inputs: 0, folder: "MechanicalDrill");
        var other = Recipe("CR_Loose", inputs: 0);
        var problems = DataGuard.CheckRecipes(new[] { drill, other }, new HashSet<string> { drill.Asset });
        var p = Assert.Single(problems);
        Assert.EndsWith("CR_Loose", p.Asset);
    }

    [Fact]
    public void WrongUsmapSignatureFailsTheTimeCheck()
    {
        // A wrong usmap drops BuildTime from every recipe.
        var recipes = Enumerable.Range(0, 20).Select(i => Recipe("CR_" + i, time: null)).ToList();
        Assert.Equal(20, DataGuard.CheckRecipes(recipes, NoExtractors).Count);
    }

    [Fact]
    public void ExtractorRecipeSetIncludesFolderSiblings()
    {
        var known = Recipe("CR_A", inputs: 0, folder: "LaserDrill");
        var sibling = Recipe("CR_B", inputs: 0, folder: "LaserDrill");
        var elsewhere = Recipe("CR_C", inputs: 0);
        var collection = new RecipeCollectionRec { Asset = "/Game/Chimera/Crafting/LaserDrill/CRC_LaserDrill", Recipes = { known.Asset } };
        var drill = new BuildingRec { IsExtractor = true, RecipeCollections = { collection.Asset } };
        var set = DataGuard.ExtractorRecipes(new[] { known, sibling, elsewhere }, new[] { collection }, new[] { drill }, Array.Empty<ExtractorRateRec>());
        Assert.Contains(sibling.Asset, set);
        Assert.DoesNotContain(elsewhere.Asset, set);
    }

    static BuildingRec Building(string type, bool extractor, bool crafts, PowerRec power) => new()
    {
        Asset = "/Game/Chimera/Buildings/X/BD_" + type,
        Type = type,
        IsExtractor = extractor,
        RecipeCollections = crafts ? new List<string> { "/Game/Chimera/Crafting/CRC_X" } : new List<string>(),
        Power = power,
    };

    [Fact]
    public void ProductionBuildingWithoutPowerIsListed()
    {
        var good = Building("ECrBuildingType::Crafting", false, true, new PowerRec { HasElectricityTrait = true, ElectricityValuePresent = true, ElectricityValue = 60 });
        var noTrait = Building("ECrBuildingType::Extraction", true, true, new PowerRec { HasElectricityTrait = false });
        var noValue = Building("ECrBuildingType::RawMaterialProcessing", false, true, new PowerRec { HasElectricityTrait = true, ElectricityValuePresent = false });
        var interior = Building("ECrBuildingType::Survival", false, true, new PowerRec { HasElectricityTrait = false }); // habitat interior: no power by design
        var problems = DataGuard.CheckBuildings(new[] { good, noTrait, noValue, interior });
        Assert.Equal(2, problems.Count);
        Assert.DoesNotContain(problems, p => p.Asset == interior.Asset || p.Asset == good.Asset);
    }
}
