# Loopsmith Manifest Generator Prompt

Copy and paste this prompt into an AI coding assistant in your game repository to automatically generate a valid Loopsmith manifest.

---

## Prompt

Please scan all audio files in this repository and generate a Loopsmith manifest file.

**Requirements:**

1. Find all audio files with extensions: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`
2. For each file, create a manifest entry with:
   - `id`: A unique stable identifier (e.g., derived from the file path)
   - `name`: The filename without extension
   - `type`: One of `SOUNDTRACK`, `SFX`, `VO`, `AMBIENCE`, or `OTHER`
   - `folder`: The relative folder path from the audio root
   - `relativePath`: The full relative path from the repository root
   - `hash`: SHA-256 hash of the file contents
   - `duration`: Duration in seconds (if you can extract it)
   - `loopMarkers`: Optional loop points if the file has loop metadata

**Classification rules:**

- **SOUNDTRACK**: Files in paths/names containing "music", "bgm", "ost", "soundtrack", "theme", "track", "song", OR files longer than 30 seconds
- **SFX**: Files in paths/names containing "sfx", "sound", "effect", "hit", "ui", "click", "explosion", "jump", "footstep", OR files shorter than 5 seconds
- **VO**: Files in paths/names containing "vo", "voice", "dialog", "dialogue", "speech", "narration", "talk", OR files between 1-30 seconds with voice content
- **AMBIENCE**: Files in paths/names containing "amb", "ambience", "ambient", "env", "environment", "atmosphere", "wind", "rain"
- **OTHER**: Fallback when no other type matches

**Output format:**

```json
{
  "version": "1.0",
  "gameRepo": "<repository-name>",
  "entries": [
    {
      "id": "unique_id_here",
      "name": "File Name",
      "type": "SOUNDTRACK",
      "folder": "relative/folder/path",
      "relativePath": "assets/audio/music/file.mp3",
      "hash": "sha256:abc123...",
      "duration": 120.5,
      "loopMarkers": {
        "start": 10.0,
        "end": 110.0
      }
    }
  ]
}
```

Save the output as `loopsmith-manifest.json` in the repository root.

**Notes:**

- The `hash` field should be a SHA-256 hash of the file contents (use a hashing library)
- Duration can be extracted using an audio metadata library (e.g., `music-metadata` for Node.js)
- Loop markers are optional and should only be included if the audio file has embedded loop metadata
- Ensure all paths use forward slashes (`/`) for cross-platform compatibility
- Generate stable IDs that won't change if files are renamed (e.g., based on content hash or original path)

---

## Example Usage

1. Copy the prompt above
2. Open your AI coding assistant (e.g., Cursor, GitHub Copilot, ChatGPT with file access)
3. Paste the prompt in your game repository
4. Review the generated `loopsmith-manifest.json`
5. Commit it to your repository
6. In Loopsmith, link the manifest via the API or UI

## Validation

The generated manifest should validate against the JSON Schema at `schemas/manifest.schema.json` in the Loopsmith repository.

You can validate it manually:

```bash
# Using a JSON Schema validator (e.g., ajv-cli)
npm install -g ajv-cli
ajv validate -s /path/to/loopsmith/schemas/manifest.schema.json -d loopsmith-manifest.json
```

Or programmatically in Node.js:

```javascript
import { manifestSchema } from '@loopsmith/core';

const manifest = JSON.parse(fs.readFileSync('loopsmith-manifest.json', 'utf-8'));
const result = manifestSchema.safeParse(manifest);

if (result.success) {
  console.log('Manifest is valid');
} else {
  console.error('Validation errors:', result.error.errors);
}
```
