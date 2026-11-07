namespace GameExtract;

/// <summary>Parsed command line. See README.md for the meaning of each option.</summary>
public sealed class Options
{
    public string Paks { get; init; }
    public string Usmap { get; init; }
    public string Out { get; init; }
    public string Build { get; init; }
    public string Engine { get; init; } = "GAME_UE5_6";
    public bool AllowMismatch { get; init; }

    public const string Usage =
        "Usage: GameExtract --paks <dir> --usmap <file> --out <dir> --build <steam buildid> [--engine GAME_UE5_6] [--allow-mismatch]";

    public static Options Parse(string[] args)
    {
        string paks = null, usmap = null, outDir = null, build = null, engine = "GAME_UE5_6";
        var allow = false;
        for (var i = 0; i < args.Length; i++)
        {
            string Next()
            {
                if (i + 1 >= args.Length) throw new ArgumentException($"Missing value for {args[i]}");
                return args[++i];
            }
            switch (args[i])
            {
                case "--paks": paks = Next(); break;
                case "--usmap": usmap = Next(); break;
                case "--out": outDir = Next(); break;
                case "--build": build = Next(); break;
                case "--engine": engine = Next(); break;
                case "--allow-mismatch": allow = true; break;
                default: throw new ArgumentException($"Unknown argument {args[i]}");
            }
        }
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(paks)) missing.Add("--paks");
        if (string.IsNullOrWhiteSpace(usmap)) missing.Add("--usmap");
        if (string.IsNullOrWhiteSpace(outDir)) missing.Add("--out");
        if (string.IsNullOrWhiteSpace(build)) missing.Add("--build");
        if (missing.Count > 0) throw new ArgumentException("Missing required: " + string.Join(", ", missing));
        return new Options { Paks = paks, Usmap = usmap, Out = outDir, Build = build, Engine = engine, AllowMismatch = allow };
    }
}
