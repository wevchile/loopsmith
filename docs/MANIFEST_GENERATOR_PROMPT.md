# Loopsmith manifest generator prompt

Use this prompt in your **game repository** (not in Loopsmith) with an AI coding assistant such as Cursor, Claude Code or GitHub Copilot. It creates a `loopsmith-manifest.json` file that Loopsmith can link to show, play and keep in sync the game's sounds.

Copy everything between the two lines below and paste it into the assistant.

---

## Prompt

Create a Loopsmith audio manifest for this repository.

**Goal**: a file named `loopsmith-manifest.json` at the root of this repository that lists every audio file in the repository, grouped by sound type, so the Loopsmith app can display and play them. Also create a small reusable script so the manifest can be regenerated whenever the game changes.

**Steps**

1. Write a script at `scripts/generate-loopsmith-manifest.mjs` (Node.js 18+, no dependencies required; you may use `music-metadata` if it is already installed to read durations). The script must:
   - Recursively scan the repository for audio files with extensions `.wav`, `.mp3`, `.ogg`, `.m4a`, `.flac` (case insensitive).
   - Skip `node_modules`, `.git`, build output folders (`dist`, `build`, `out`, `Library`, `Temp`, `.godot`, `.import`) and any folder starting with a dot.
   - Write `loopsmith-manifest.json` at the repository root with the format below.
2. Run the script and check that the output is valid against the format.
3. Print a short summary: number of files per type and the list of files classified as `OTHER`.

**Format**

```json
{
  "version": "1.0",
  "gameRepo": "<repository folder name>",
  "entries": [
    {
      "id": "sfx-ui-click",
      "name": "click.wav",
      "type": "SFX",
      "folder": "ui",
      "relativePath": "assets/audio/sfx/ui/click.wav",
      "hash": "sha256:<hex digest of the file contents>",
      "duration": 0.42,
      "loopMarkers": { "start": 1.5, "end": 30.0 }
    }
  ]
}
```

Field rules:

- `version`: always `"1.0"`.
- `gameRepo`: the repository folder name.
- `id`: unique and **stable** between runs. Use the relative path in lowercase with every non alphanumeric character replaced by `-` (for example `assets-audio-sfx-ui-click-wav`). Never use random values or indexes.
- `name`: the file name with extension.
- `type`: exactly one of `SOUNDTRACK`, `SFX`, `VO`, `AMBIENCE`, `OTHER` (see classification).
- `folder`: the subfolder that best describes the sound inside its type, using forward slashes (for example `ui`, `weapons`, `level1`). Use `""` when there is none.
- `relativePath`: path from the repository root (the folder that contains the manifest) to the file, with forward slashes. Never use absolute paths or `..`.
- `hash`: `sha256:` plus the SHA-256 hex digest of the file contents. Loopsmith uses it to detect renamed and moved files.
- `duration` (optional): length in seconds, only if it can be read reliably.
- `loopMarkers` (optional): only if the file or the game's code defines loop points.

**Classification** (be strategic, the better the classification, the more useful the app). Split the path and file name into words (on `/`, `_`, `-`, `.`, spaces and camelCase) and apply the first rule that matches:

1. `VO` (voices, dialogue, narration): words like `vo`, `vox`, `voice`, `voices`, `dialog`, `dialogue`, `speech`, `narration`, `narrator`, `line`, `bark`, character names used as speaker folders, or language folders like `en`, `es` inside a voice folder.
2. `SOUNDTRACK` (music): words like `music`, `bgm`, `ost`, `soundtrack`, `theme`, `song`, `score`, `track`, `battle`, `boss`, `menu`, `title`, `credits`, or files referenced by the game's music player code.
3. `AMBIENCE` (background environment loops): words like `amb`, `ambience`, `ambient`, `atmos`, `atmosphere`, `env`, `environment`, `wind`, `rain`, `forest`, `cave`, `city`, `room tone`, `crowd`, `water`.
4. `SFX` (short effects): words like `sfx`, `se`, `fx`, `sound`, `sounds`, `effect`, `ui`, `click`, `hit`, `jump`, `footstep`, `explosion`, `shot`, `impact`, `pickup`, `coin`, `hurt`, `door`, `weapon`.
5. If no word matches, use the duration when available: 30 seconds or more is `SOUNDTRACK`, 5 seconds or less is `SFX`.
6. If the game code clearly uses the file in a specific way (music player, sound effect player, dialogue system), prefer that over the rules above.
7. Anything that still cannot be classified goes to `OTHER`. Do not guess.

**Notes**

- Do not move, rename or modify any audio file.
- Sort entries by `relativePath` so diffs are easy to review.
- Commit both `scripts/generate-loopsmith-manifest.mjs` and `loopsmith-manifest.json`.
- When audio files change, run `node scripts/generate-loopsmith-manifest.mjs` again.

---

## After generating the manifest

1. Open Loopsmith (`pnpm dev` in the Loopsmith folder) and select or create the project for this game.
2. In "Manifiesto del juego / Game manifest", paste the absolute path to the file, for example `C:\games\my-game\loopsmith-manifest.json`, and press "Review changes".
3. Press "Link". The sounds appear in the list grouped by type and can be played.
4. Every time the game changes: rerun the script in the game repository, then press "Check for changes" in Loopsmith, review and "Apply".

## Validation

The format is described by the JSON Schema at `schemas/manifest.schema.json` in the Loopsmith repository. Loopsmith also validates the file when you press "Review changes" and lists any problem (invalid fields, duplicate ids, or paths that point outside the manifest folder).

To validate from the command line:

```bash
npx ajv-cli validate -s /path/to/loopsmith/schemas/manifest.schema.json -d loopsmith-manifest.json
```
