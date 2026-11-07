using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace GameExtract;

/// <summary>Helpers for reading the JSON that CUE4Parse produces for an export, and for writing our own files.</summary>
public static class J
{
    static readonly Regex ObjectIndex = new(@"\.\d+$", RegexOptions.Compiled);

    public static readonly JsonSerializerSettings Write = new()
    {
        Formatting = Formatting.Indented,
        // camelCase our own property names, but keep dictionary keys (asset names, string keys) exactly as they are.
        ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false } },
        NullValueHandling = NullValueHandling.Ignore,
    };

    /// <summary>"/Game/Chimera/Items/I_Accumulator.1" (object ref) or "/Game/x/DA_X.DA_X" (soft path) -> package path.</summary>
    public static string Asset(JToken t)
    {
        if (t == null || t.Type == JTokenType.Null) return null;
        if (t.Type == JTokenType.String) return StripObject(t.Value<string>());
        if (t is JObject o)
        {
            var p = o["ObjectPath"]?.Value<string>() ?? o["AssetPathName"]?.Value<string>();
            return p == null ? null : StripObject(p);
        }
        return null;
    }

    static string StripObject(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;
        path = ObjectIndex.Replace(path, "");
        var slash = path.LastIndexOf('/');
        var dot = path.IndexOf('.', slash + 1);
        return dot > 0 ? path[..dot] : path;
    }

    /// <summary>Resolved text of an FText property (LocalizedString, else SourceString).</summary>
    public static string Text(JToken t)
    {
        if (t is not JObject o) return t?.Type == JTokenType.String ? t.Value<string>() : null;
        return o["LocalizedString"]?.Value<string>() ?? o["SourceString"]?.Value<string>() ?? o["CultureInvariantString"]?.Value<string>();
    }

    public static string TextKey(JToken t)
    {
        if (t is not JObject o) return null;
        var table = o["TableId"]?.Value<string>();
        var key = o["Key"]?.Value<string>();
        return table != null && key != null ? $"{table}:{key}" : null;
    }

    public static double? Num(JToken t) => t == null || t.Type == JTokenType.Null ? null : t.Value<double>();
    public static int? Int(JToken t) => t == null || t.Type == JTokenType.Null ? null : t.Value<int>();

    /// <summary>The enum text after "::" would lose information, so enums stay as the game writes them.</summary>
    public static string Str(JToken t) => t == null || t.Type == JTokenType.Null ? null : t.Value<string>();

    public static List<ItemCount> ItemCounts(JToken arr, string itemProp = "Item", string countProp = "Count")
    {
        var list = new List<ItemCount>();
        if (arr is not JArray a) return list;
        foreach (var e in a)
            list.Add(new ItemCount { Item = Asset(e[itemProp]), Count = Int(e[countProp]) ?? 0 });
        return list;
    }

    /// <summary>
    /// Compact copy of a property tree: object references and soft paths become their package path string, FText
    /// becomes its text; everything else is kept as the game wrote it.
    /// </summary>
    public static JToken Simplify(JToken t)
    {
        switch (t)
        {
            case null:
                return null;
            case JObject o:
                if (o["ObjectPath"] != null && o.Count <= 2) return Asset(o);
                if (o["AssetPathName"] != null && o.Count <= 2) return Asset(o);
                if (o["SourceString"] != null && o["LocalizedString"] != null) return Text(o);
                var copy = new JObject();
                foreach (var p in o.Properties()) copy[p.Name] = Simplify(p.Value);
                return copy;
            case JArray a:
                var arr = new JArray();
                foreach (var e in a) arr.Add(Simplify(e));
                return arr;
            default:
                return t.DeepClone();
        }
    }

    public static void WriteFile(string path, object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, JsonConvert.SerializeObject(value, Write) + "\n");
    }
}
