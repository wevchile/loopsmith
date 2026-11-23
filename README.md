# loopsmith

Loopsmith is a free, open source (MIT) web app that runs on your own computer and helps you create and edit music and sound for video games with AI. The first AI provider is Google Lyria through the Gemini API, and the code is organized so more music AIs can be added later.

The interface is in Spanish by default and can be switched to English.

## Features

- **Projects per game**: each game is a folder on your disk with its own settings, sounds and history.
- **Dark, editor-style UI**: a two-column workspace (sound library on the left, a collapsible inspector with Generate / Track / History tabs on the right), Spanish by default with an English switch.
- **Folders CRUD**: create, rename and delete folders and subfolders from the library folder bar or the settings modal. New projects start with one folder per sound type: `SOUNDTRACK`, `SFX`, `VO`, `AMBIENCE`, `OTHER`.
- **Originals vs AI tracks**: sounds from the game manifest carry an "Original" badge and are read-only (except through "Replace original", below). AI tracks carry an "IA / AI" badge and a status: Candidata (default), Elegida or Descartada. AI tracks can be linked to an original (automatic when you generate with an original as the base) and are grouped under it. Only one AI track per original can be Elegida.
- **Replace original**: write a chosen AI track over its original in your local game repository. The original is first renamed to a numbered backup in the same folder (`soundtrack_autum.wav` becomes `soundtrack_autum_1.wav`), the format is converted with ffmpeg when needed, the manifest entry is updated, and every replacement can be reverted.
- **AI track actions**: rename (the file on disk too), move to another folder, duplicate, delete (with confirmation), notes and tags. Any track, original or AI, can be downloaded.
- **Project context (optional)**: a text such as "everything in retro 8-bit style" that is added to every prompt of the project.
- **Generate music from a prompt** with Lyria. Files are saved locally in the folder you choose. By default your prompt is sent verbatim inside a short fixed frame ("direct mode"); "Pulir con IA / Polish with AI" optionally lets Gemini polish it first.
- **Seamless loops by default**: each track is an exact loop (16 s unless you set a duration) whose wrap point is crossfaded with the music Lyria played past it, saved as 16-bit 44.1 kHz WAV. Switch to "Con final / With ending" for a piece that ends with a fade-out. "Escuchar unión / Hear the seam" plays the end and the start back to back.
- **Model by duration**: short loops use `lyria-3-clip-preview`, longer tracks `lyria-3.5` (configurable).
- **Instrumental by default**: a switch allows vocals per generation, and each project has its own default.
- **Variants from a base track**: switch on "use the selected track as the base", Gemini listens to it and describes it, and Lyria creates a new variant with your changes. The original file is never modified.
- **Player**: play, pause, stop, loop, volume and waveform.
- **History**: every generation is recorded with its prompt, final prompt, model, vocals setting and output file.
- **Game manifest**: link a `loopsmith-manifest.json` generated in your game repository to browse and play the game's existing sounds, grouped by type. When the game changes, Loopsmith shows what was added, removed, renamed, moved or updated before applying it.
- **Local and safe**: the server only listens on `127.0.0.1` and only reads and writes inside your configured folders (and, for a linked manifest, inside the manifest's folder).

## Requirements

- **Node.js 22 or newer** (tested with Node 24): https://nodejs.org/
- **pnpm 10 or newer** (tested with pnpm 12.18): https://pnpm.io/installation
- **Git** to clone the repository.
- **A Gemini API key** for AI generation: https://aistudio.google.com/api-keys (optional to try the app; see "Running without an API key").
- **ffmpeg** (recommended): builds the seamless loops (and converts formats for "Replace original"). On Windows: `winget install Gyan.FFmpeg`. Without it Loopsmith falls back to a built-in cutter with a fade-out (no loop seam).

## Installation

### Windows (PowerShell)

```powershell
# 1. Install pnpm if you do not have it (or follow https://pnpm.io/installation)
npm install -g pnpm

# 2. Clone the repository
cd C:\github
git clone https://github.com/wevchile/loopsmith.git
cd loopsmith

# 3. Install dependencies
pnpm install

# 4. Create your .env from the example and edit it
Copy-Item .env.example .env
notepad .env
```

### macOS / Linux

```bash
npm install -g pnpm
git clone https://github.com/wevchile/loopsmith.git
cd loopsmith
pnpm install
cp .env.example .env
# edit .env with your editor
```

### About `pnpm install` and install scripts

Recent pnpm versions block dependency install scripts unless they are approved. The approvals are already in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true      # needed by Vite and tsx
  protobufjs: false  # optional version check, not needed
```

So `pnpm install` works without running `pnpm approve-builds`. The lockfile is also compatible with pnpm's `minimumReleaseAge` supply chain policy. If pnpm warns that the `pnpm` field in `package.json` is ignored, you are on an old checkout: pull the latest version.

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | (empty) | Your key from https://aistudio.google.com/api-keys. Required only for generation. |
| `GEMINI_API_VERSION` | `v1beta` | Gemini API version. Lyria is only served on `v1beta`; keep the default. |
| `LYRIA_MODEL_SHORT` | `lyria-3-clip-preview` | Model for loops and pieces up to 29 s. |
| `LYRIA_MODEL_LONG` | `lyria-3.5` | Model for longer tracks and for pieces "with ending" without a duration. |
| `LYRIA_MODEL` | (empty) | If set, this one model is used for every generation and the two above are ignored. See "Lyria models". |
| `LYRIA_OUTPUT_FORMAT` | `mp3` | Format requested from Lyria: `mp3` or `wav` (`wav` only with `lyria-3.5`). Loops are always saved as WAV after processing. |
| `LOOPSMITH_PROMPT_MODE` | `direct` | `direct`: your prompt verbatim inside a fixed frame. `refine`: "Pulir con IA" is on by default. Either way it can be switched per generation. |
| `LOOPSMITH_REFINE_MODEL` | `gemini-3.8-flash` | Gemini text model used by "Pulir con IA". |
| `LOOPSMITH_DEFAULT_LOOP_SECONDS` | `16` | Loop length when the duration field is empty. |
| `LOOPSMITH_LOOP_SEAM_SECONDS` | `0.25` | Crossfade at the loop point. |
| `LOOPSMITH_TRIM_TO_DURATION` | `true` | Enforce the duration locally (loop seam, or fade-out for "with ending"). `false` keeps whatever Lyria returns. |
| `LOOPSMITH_KEEP_UNTRIMMED` | `true` | Keep the full model output in `<project>/.loopsmith-untrimmed`. |
| `LOOPSMITH_FADE_OUT_SECONDS` | `1.5` | Fade-out length for pieces "with ending". |
| `LOOPSMITH_FFMPEG` | `ffmpeg` | ffmpeg executable, or `off` to use the built-in cutter. |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.6-flash` | Model that describes a base track for variants. |
| `LOOPSMITH_ROOTS` | `./loopsmith-data` | Comma separated folders where projects live. Relative paths start at the repository folder. |
| `LOOPSMITH_SERVER_PORT` | `3001` | API port (always bound to 127.0.0.1). |
| `LOOPSMITH_WEB_PORT` | `3000` | Web app port. |
| `LOOPSMITH_OPEN_BROWSER` | `true` | Open the browser when running `pnpm dev`. |

Restart `pnpm dev` after changing `.env`.

Only `GEMINI_API_KEY` is needed to generate. Keys created in AI Studio work in both formats (`AIza...` and `AQ...`). `GOOGLE_CLOUD_PROJECT` and other Vertex AI settings are not used.

## Running

```bash
pnpm dev
```

This builds the shared packages and starts:

- the web app at http://127.0.0.1:3000 (opens in your browser)
- the API at http://127.0.0.1:3001 (health check: http://127.0.0.1:3001/api/health)

Stop it with `Ctrl+C`.

### Running without an API key

Everything except generation works without `GEMINI_API_KEY`: projects, folders, context, the player and manifests. The app shows a yellow banner explaining how to add the key, and the Generate button stays disabled. The API answers generation requests with HTTP 503 and the code `API_KEY_MISSING`.

## Using Loopsmith

1. **Create a project** with "Nuevo proyecto / New project". Give it a name and, optionally, a context such as `retro 8-bit, chiptune, fast tempo`. A folder is created in your first root with the five type folders.
2. **Organize folders** with the folder bar above the library (new subfolder, rename, delete) or in Settings (gear icon) > Carpetas / Folders.
3. **Generate**: write a prompt (in any language, as you would describe it), keep "Allow vocals" off for instrumental music (default) or switch it on, pick "Loop" (default for music and ambience) or "Con final" (default for SFX and VO), optionally set the duration (empty = 16 s loop), choose where to save it and press Generate. The file appears in the sounds list and in the history, where "Prompts" shows your prompt and the exact text sent to Lyria.
4. **Listen**: click a sound to open the player (play, pause, stop, loop, volume, and "Escuchar unión" to hear the last 3 s followed by the first 3 s, the point where a loop restarts). Keyboard: arrow keys move the selection, Space plays or pauses, Escape deselects, `i` shows or hides the inspector and `,` opens Settings.
5. **Review AI tracks**: mark each one as Candidata, Elegida or Descartada with the row icons or in the Track tab, link it to an original, add notes and tags, and filter the library by status. The "..." menu has rename, move, duplicate, link and delete.
6. **Create a variant**: click "Use as base" on a sound (or switch on "Use the selected track as the base"), describe the changes ("faster and darker") and generate. A new file is created next to the others.
7. **Link your game** (optional): open Settings > Manifiesto del juego / Game manifest, see the next section.

All data is stored as plain files inside each project folder:

```
loopsmith-data/
  My_Game/
    loopsmith.project.json   project settings (name, context, vocals default, linked manifest)
    history.json             generation history and AI track metadata (status, linked original, notes, tags)
    replacements.json        log of "replace original" operations (paths, backups, hashes before and after)
    manifest.snapshot.json   last applied manifest (only when a manifest is linked)
    SOUNDTRACK/ SFX/ VO/ AMBIENCE/ OTHER/   your audio files and subfolders
```

## Linking a game with a manifest

A manifest is a JSON file that lists the sounds of a game repository: their name, type, folder and path. Loopsmith uses it to show and play the game's sounds without copying them.

1. Open your game repository with an AI coding assistant and paste the prompt from [`docs/MANIFEST_GENERATOR_PROMPT.md`](docs/MANIFEST_GENERATOR_PROMPT.md). It creates `loopsmith-manifest.json` at the root of the game repository.
2. In Loopsmith, open your project, paste the absolute path of that file in "Manifiesto del juego / Game manifest" (for example `C:\games\my-game\loopsmith-manifest.json`) and press "Review changes".
3. Check the summary and press "Link". The game's sounds appear in the list, marked as `manifest`.
4. When the game changes, regenerate the manifest in the game repository and press "Check for changes" in Loopsmith. You will see what was added, removed, renamed, moved or updated, and nothing changes until you press "Apply". Your generated files are never touched.

Rules:

- `relativePath` is relative to the folder that contains the manifest. Entries that point outside that folder are rejected.
- Matching between versions uses `id` first and then `hash`, so keep ids stable and include a content hash to detect renames and moves.
- The JSON Schema is in [`schemas/manifest.schema.json`](schemas/manifest.schema.json).

Example:

```json
{
  "version": "1.0",
  "gameRepo": "my-game",
  "entries": [
    {
      "id": "music-main-theme",
      "name": "main_theme.ogg",
      "type": "SOUNDTRACK",
      "folder": "music",
      "relativePath": "assets/audio/music/main_theme.ogg",
      "hash": "sha256:9f2c...",
      "duration": 120.5,
      "loopMarkers": { "start": 10.0, "end": 110.0 }
    },
    {
      "id": "sfx-ui-click",
      "name": "click.wav",
      "type": "SFX",
      "folder": "ui",
      "relativePath": "assets/audio/sfx/ui/click.wav",
      "hash": "sha256:41ab..."
    }
  ]
}
```

## Replacing an original in the game

"Reemplazar original / Replace original" is the only action that writes into your game repository. It is available in the Track tab for an AI track that is linked to an original (highlighted when the track is Elegida). A warning modal shows the AI file, the original's exact path, the backup name and any format conversion, and you must tick the confirmation box.

What happens, in this order:

1. Loopsmith picks the next free numbered name in the same folder: `soundtrack_autum_1.wav`, then `_2`, `_3`... Names that exist on disk, belong to another manifest entry or are earlier backups are skipped.
2. The original is **renamed** to that backup name first, so two files never share a name.
3. The AI track is copied (or converted with ffmpeg to the original's format, keeping its sample rate and channels) to a temporary file in the same folder and then renamed to the original's exact file name. Existing files are never overwritten.
4. The manifest entry's `hash` (and `duration`, if the entry has one) is updated in `loopsmith-manifest.json`, keeping the file's formatting, order and other entries. The project snapshot is updated too, so "Check for changes" stays clean.
5. The backup is listed in `.loopsmith-backups.json` at the game root (backups are never added to the manifest), and the operation is recorded in `replacements.json` in the project with hashes before and after.

If any step after the rename fails, the original gets its name back and the manifest is restored.

**Reverting**: select the original (badge "Reemplazado") and press "Revertir reemplazo". The current AI version is removed (the AI track is still in your project) and the latest backup gets the original name back. If the file was modified after the replacement, it is kept with the next numbered name instead of deleted. Replacements stack: replacing twice and reverting twice brings back the first original.

ffmpeg is required only when the AI track and the original have different formats (for example MP3 to WAV).

## About Lyria

Loopsmith uses the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK and the Gemini Interactions API (`POST v1beta/interactions`), as described in the [Lyria music generation guide](https://ai.google.dev/gemini-api/docs/music-generation).

- **API version `v1beta` is required.** The SDK defaults to `v1`, where the API answers `404 Model 'lyria-3.5' not found`. Loopsmith creates the client with `apiVersion: 'v1beta'` (configurable with `GEMINI_API_VERSION`).

### Lyria models

Loopsmith picks the model by duration: `LYRIA_MODEL_SHORT` (default `lyria-3-clip-preview`) for loops and pieces up to 29 seconds, `LYRIA_MODEL_LONG` (default `lyria-3.5`) for longer ones and for pieces "with ending" without a duration. Setting `LYRIA_MODEL` forces one model for everything. The panel shows which model the next generation will use. Status and prices from the Gemini API docs ([music generation](https://ai.google.dev/gemini-api/docs/music-generation), [models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations)), November 2026:

| Model | Status | Length | Output | Price (paid tier) | Notes |
| --- | --- | --- | --- | --- | --- |
| `lyria-3-clip-preview` (default short) | Preview | Always 30 s | MP3, stereo | USD 0.04 per clip | Short clips and loops, faster. 30 s covers loops up to 29 s plus the seam. |
| `lyria-3.5` (default long) | Stable | A couple of minutes, prompt hint only | MP3 or WAV, 44.1 kHz stereo | USD 0.08 per song | Flagship. Best for full tracks. |
| `lyria-3-pro-preview` | Preview, previous generation | A couple of minutes | MP3, stereo | USD 0.08 per song | Google lists `lyria-3.5` as its replacement. |
| `lyria-realtime-exp` | Experimental | Endless live stream | Raw PCM over WebSocket | - | Not supported: it streams live and cannot return a file. Loopsmith shows a configuration error if selected. |

There is no free tier for Lyria. Every model above (except RealTime) is called the same way, with the Interactions API on `v1beta`. Unknown model ids are passed through the same way, so new Lyria models can be tried from `.env` without code changes. The clip model is a preview: if Google changes or retires it, set `LYRIA_MODEL_SHORT=lyria-3.5`.

### How the prompt is built

**Direct mode (default).** Loopsmith sends a short, fixed English frame and then your words, verbatim, last. The frame only sets the form, never a genre, tempo or key, so your prompt decides the style. This is the approach of the pudu-godot sound studio, which gave clearly better results than a long rewritten prompt. Example (loop, instrumental, context `Costa de Chiloé, Chile`):

> Compose an original instrumental soundtrack for a video game. Make a seamless 16-second loop, with the ending flowing rhythmically and harmonically into the first beat. Begin immediately and continue past the loop point. Avoid an intro, final cadence, fade or silence. No vocals. Context: Costa de Chiloé, Chile. Musical direction: Utiliza el ritmo de vals en tonalidad mayor usando instrumentos como el violin y el acordeon

- With vocals on, "instrumental" and "No vocals" are left out.
- "Con final / With ending" replaces the loop sentences with "Make a complete N-second piece that begins immediately and reaches a natural final cadence at N seconds. Avoid a long intro."
- The piece is named by the output folder type: soundtrack (SOUNDTRACK, OTHER), ambient background soundscape (AMBIENCE), short musical sound effect (SFX), voice-centered piece (VO).
- The project context is collapsed to one line and cut at 400 characters. With "use as base", the Gemini description of the base track is added before your direction.
- Your prompt is last, so it has the final word: with context "8-bit" and prompt "musica electronica", Lyria reads the electronic request at the end.

**Pulir con IA / Polish with AI (optional).** A switch in the panel (default from `LOOPSMITH_PROMPT_MODE`). A Gemini text model (`LOOPSMITH_REFINE_MODEL`, temperature 0.25) lightly rewrites only the musical direction: it keeps your words and cultural references (named songs, composers, regional rhythms), invents no BPM, key or timing markers unless you gave them, writes 40 to 70 words in English, and drops whatever part of the project context conflicts with your prompt. Loopsmith then wraps that text in the same frame as direct mode, so the loop or ending wording, the length and the vocals instruction always come from code. If the call fails, the direct prompt is used. It costs a fraction of a cent.

The history stores your prompt, the polished direction (if any) and the exact text sent to Lyria; open "Prompts" on a history entry to compare them.

### Duration and loops

**Lyria has no duration parameter** (the API rejects `generation_config.duration`, the clip model is fixed at 30 seconds, and `lyria-3.5` returns songs of two to three minutes whatever the prompt says). Loopsmith enforces the length locally:

- **Loop (default)**: the frame asks Lyria to start immediately and keep playing past the loop point. Loopsmith takes exactly N seconds and crossfades the 0.25 s Lyria played after N into the first 0.25 s (linear), then appends the untouched body, so playback wraps on consecutive samples with no fade-out and no gap. The result is 16-bit PCM WAV at 44.1 kHz stereo with exactly N x 44100 frames, decoded once from the model output (no MP3 re-encode). If the model output is only slightly longer than N, the seam is shortened; if it is not longer, the file is kept as is with a note. Without ffmpeg it falls back to a fade-out cut.
- **Con final / With ending**: cut to N seconds with a 1.5 second fade-out (WAV with ffmpeg). Without a duration the piece is kept in full.

The untouched model output is kept in `<project>/.loopsmith-untrimmed/` (hidden from the track list), and the history entry records the requested, generated and final lengths and the seam or fade used.

### Other notes

- **Instrumental vs vocals**: Lyria has no separate "instrumental" parameter, so when vocals are off the frame says "instrumental" and "No vocals".
- **Variants**: Lyria does not accept an audio file as input, so the "base track" option first asks a Gemini model to describe the track (genre, instruments, mood, tempo, key) and then sends that description plus your changes to Lyria.
- Lyria only creates music. It works well for `SOUNDTRACK` and reasonably for `AMBIENCE`, not for real sound effects or voice lines. Those types are ready for future providers.
- **Song structure is not lyrics**: Lyria returns a structure text with every track. For instrumentals it is only markers such as `[[A0]]` or `<instrumental>`; Loopsmith saves it as `structure` in the history and only shows real lyrics as lyrics.
- Generation is billed by Google per request; check https://ai.google.dev/gemini-api/docs/pricing before generating a lot. All generated audio carries an inaudible SynthID watermark.

## Adding another AI provider

1. Create `packages/providers/src/my-provider.ts` implementing `MusicProvider` from `packages/providers/src/provider.ts` (`id`, `name`, `model`, `capabilities`, `generate()` and optionally `analyzeReference()`).
2. Register it in `ProviderRegistry.createDefault()` in `packages/providers/src/provider-registry.ts` when its configuration is present.
3. Add its settings to `apps/server/src/config.ts` and `.env.example`.

## Project structure

```
apps/web            Vite + React UI (react-i18next, wavesurfer.js)
apps/server         Fastify API bound to 127.0.0.1 (projects, folders, audio streaming, manifests, generation)
packages/core       Shared types, manifest schema and sync, sound classifier, path safety
packages/providers  AI provider interface and the Gemini Lyria provider
schemas/            JSON Schema of the manifest
docs/               Prompt to generate a manifest from a game repository
```

## Development

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds shared packages, starts web and API in watch mode |
| `pnpm build` | Builds every package and the web app |
| `pnpm typecheck` | TypeScript checks for every package |
| `pnpm lint` | Same as `typecheck` for now |
| `pnpm test` | Runs the unit and API tests (Vitest) |
| `pnpm clean` | Deletes build output (`dist` folders) |

Build output and TypeScript incremental files (`dist/`, `*.tsbuildinfo`) are never committed.

## License

[MIT](LICENSE)
