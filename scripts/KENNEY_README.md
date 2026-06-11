# Kenney assets (optional enhancement)

OpenMind's three game shells are **fully playable with programmatic art alone**
— every sprite (mascot, companions, hero, keeper, balls, targets, diagram
nodes) is drawn with Phaser Graphics. Kenney's CC0 packs are an optional
visual upgrade layer.

## Why a script you run locally

The build sandbox can't reach kenney.nl, so asset fetching is a local step:

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\fetch_kenney.ps1
```

```bash
# macOS / Linux (needs jq + unzip)
bash scripts/fetch_kenney.sh
```

## What it does

1. Downloads three packs into `scripts/downloads/` (kept out of git):
   - **Sports Pack** — goal_shootout (balls, keeper, targets)
   - **Platformer Pack Redux** — quest_path (hero frames, tiles)
   - **Puzzle Pack** — draw_connect (nodes, sparkles)
2. Unzips and copies the files listed in `kenney_mapping.json` into
   `shells/assets/kenney/<game>/`.
3. You rebuild the shells: `npm -w shells run build`.

## When the auto-download fails

Kenney occasionally moves direct download URLs. The script never guesses
twice — it prints the asset page URL and the exact filename to save into
`scripts/downloads/`, then you re-run it. Already-downloaded zips are reused.

If a *file inside a pack* is missing (pack reorganized), the script prints the
bad `from` path — fix it in `kenney_mapping.json` (open the extracted folder
in `scripts/downloads/<pack>/` to find the new location).

## License

All Kenney assets are CC0 (public domain) — no attribution required, but
[kenney.nl](https://kenney.nl) deserves the love anyway.

## Current integration status (v4.0)

The build script notes the presence of `shells/assets/kenney/` but the shells
intentionally ship with programmatic art as the only render path — swapping
in Kenney sprites is wired as a future enhancement (see DECISIONS.md). The
mapping + scripts exist now so the asset pipeline is ready when a theme wants
bitmap art.
