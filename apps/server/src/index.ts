import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { loadConfig } from './config.js';
import { Storage } from './storage.js';
import { ProviderRegistry } from '@loopsmith/providers';
import { projectsRoutes } from './routes/projects.js';
import { generateRoutes } from './routes/generate.js';
import { manifestRoutes } from './routes/manifest.js';

async function main() {
  const config = loadConfig();
  const storage = new Storage(config.allowedRoots);

  const providerRegistry = ProviderRegistry.createDefault({
    apiKey: config.geminiApiKey,
    projectId: config.googleCloudProject,
    location: config.googleCloudLocation,
  });

  const fastify = Fastify({
    logger: {
      level: 'info',
    },
  });

  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(multipart);

  fastify.get('/health', async () => {
    const providers = providerRegistry.listProviders();
    const hasApiKey = !!config.geminiApiKey;

    return {
      status: 'ok',
      providers: providers.map(p => ({ id: p.id, name: p.name })),
      apiKeyConfigured: hasApiKey,
      allowedRoots: config.allowedRoots,
    };
  });

  await fastify.register(projectsRoutes, { prefix: '/api', storage, allowedRoots: config.allowedRoots });
  await fastify.register(generateRoutes, { prefix: '/api', storage, providerRegistry, allowedRoots: config.allowedRoots });
  await fastify.register(manifestRoutes, { prefix: '/api', storage, allowedRoots: config.allowedRoots });

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server listening on ${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
