import { mkdir } from 'node:fs/promises';
import { REPO_ROOT, loadEnvFile } from './env.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

async function main() {
  loadEnvFile();
  const config = loadConfig(process.env, REPO_ROOT);

  // The first root is the default place for new projects; make sure it exists.
  await mkdir(config.allowedRoots[0], { recursive: true });

  const app = await buildApp(config);

  if (!config.geminiApiKey) {
    app.log.warn('GEMINI_API_KEY is not set: browsing, folders and manifests work, music generation is disabled.');
  } else {
    app.log.info(
      config.lyriaModel
        ? `Music generation enabled with model ${config.lyriaModel} (LYRIA_MODEL overrides the short/long pair)`
        : `Music generation enabled: ${config.lyriaModelShort} up to 29 s, ${config.lyriaModelLong} for longer tracks`
    );
    app.log.info(`Prompt mode: ${config.promptMode}`);
  }
  app.log.info(`Storage roots: ${config.allowedRoots.join(', ')}`);

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = () => {
    app.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
