# loopsmith

Loopsmith is a free, open source (MIT) web app that runs on your own computer and helps you create and edit music and sound for video games with AI. The first AI provider is Google Lyria through the Gemini API, and the code is organized so more music AIs can be added later.

The interface is in Spanish by default and can be switched to English.

## Features

- **Projects per game**: each game is a folder on your disk with its own settings, sounds and history.
- **Folders CRUD**: create, rename and delete folders and subfolders. New projects start with one folder per sound type: `SOUNDTRACK`, `SFX`, `VO`, `AMBIENCE`, `OTHER`.
- **Project context (optional)**: a text such as "everything in retro 8-bit style" that is added to every prompt of the project.
- **Generate music from a prompt** with Lyria. Files are saved locally in the folder you choose.
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
| `LYRIA_MODEL` | `lyria-3.5` | Lyria model. `lyria-3-clip-preview` makes 30 second clips. |
| `LYRIA_OUTPUT_FORMAT` | `mp3` | `mp3` or `wav`. |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.6-flash` | Model that describes a base track for variants. |
| `LOOPSMITH_ROOTS` | `./loopsmith-data` | Comma separated folders where projects live. Relative paths start at the repository folder. |
| `LOOPSMITH_SERVER_PORT` | `3001` | API port (always bound to 127.0.0.1). |
| `LOOPSMITH_WEB_PORT` | `3000` | Web app port. |
| `LOOPSMITH_OPEN_BROWSER` | `true` | Open the browser when running `pnpm dev`. |

Restart `pnpm dev` after changing `.env`.

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
2. **Organize folders** in the "Carpetas / Folders" panel: hover a folder to add a subfolder (+), rename it or delete it.
3. **Generate**: write a prompt, keep "Allow vocals" off for instrumental music (default) or switch it on, choose where to save it and press Generate. The file appears in the sounds list and in the history.
4. **Listen**: click a sound to open the player (play, pause, stop, loop, volume).
5. **Create a variant**: click "Use as base" on a sound (or switch on "Use the selected track as the base"), describe the changes ("faster and darker") and generate. A new file is created next to the others.
6. **Link your game** (optional): see the next section.

All data is stored as plain files inside each project folder:

```
loopsmith-data/
  My_Game/
    loopsmith.project.json   project settings (name, context, vocals default, linked manifest)
    history.json             generation history
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

## About Lyria

Loopsmith uses the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK and the Gemini Interactions API, as described in the [Lyria music generation guide](https://ai.google.dev/gemini-api/docs/music-generation).

- **Default model: `lyria-3.5`**, listed as Google's flagship (stable, no `-preview` suffix) music model in the [models list](https://ai.google.dev/gemini-api/docs/models). It creates full tracks of a couple of minutes at 44.1 kHz.
- `lyria-3-clip-preview` creates 30 second clips and is useful to iterate quickly; set `LYRIA_MODEL=lyria-3-clip-preview` to use it.
- **Lyria RealTime is not used**: it streams music live over a WebSocket, while Loopsmith creates and saves complete files. Lyria 3.5 covers that use case with a simpler request.
- **Instrumental vs vocals**: Lyria has no separate "instrumental" parameter, so when vocals are off Loopsmith adds an explicit "Instrumental only, no vocals" instruction to the prompt, as recommended in the guide.
- **Variants**: Lyria does not accept an audio file as input, so the "base track" option first asks a Gemini model to describe the track (genre, instruments, mood, tempo, key) and then sends that description plus your changes to Lyria.
- Lyria only creates music. It works well for `SOUNDTRACK` and reasonably for `AMBIENCE`, not for real sound effects or voice lines. Those types are ready for future providers.
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
