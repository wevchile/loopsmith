import Fastify, { type FastifyInstance } from 'fastify';
import { ProviderRegistry } from '@loopsmith/providers';
import type { Config } from './config.js';
import { HttpError, Storage } from './storage.js';
import { projectsRoutes } from './routes/projects.js';
import { generateRoutes, API_KEY_MISSING_MESSAGE } from './routes/generate.js';
import { manifestRoutes } from './routes/manifest.js';
import { audioRoutes } from './routes/audio.js';

export interface AppOptions {
  logger?: boolean;
  providerRegistry?: ProviderRegistry;
}

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function hostnameOf(value: string): string {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return '';
  }
}

export async function buildApp(config: Config, options: AppOptions = {}): Promise<FastifyInstance> {
  const storage = new Storage(config.allowedRoots);
  const providerRegistry =
    options.providerRegistry ??
    ProviderRegistry.createDefault({
      apiKey: config.geminiApiKey,
      lyriaModel: config.lyriaModel,
      analysisModel: config.analysisModel,
      outputFormat: config.outputFormat,
    });

  const app = Fastify({
    logger: options.logger === false ? false : { level: 'info' },
    bodyLimit: 2 * 1024 * 1024,
    disableRequestLogging: true,
  });

  // Accept an empty body with Content-Type: application/json (some clients send it on DELETE).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf-8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new HttpError(400, 'Invalid JSON body', 'INVALID_JSON'), undefined);
    }
  });

  // Local-only API: reject requests whose Host or Origin is not this computer
  // (protects against DNS rebinding and against other websites calling the API).
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host ?? '';
    if (!LOCAL_HOSTNAMES.has(hostnameOf(host))) {
      return reply.code(403).send({ error: 'Forbidden host', code: 'FORBIDDEN_HOST' });
    }
    const origin = request.headers.origin;
    if (origin && !LOCAL_HOSTNAMES.has(hostnameOf(origin))) {
      return reply.code(403).send({ error: 'Forbidden origin', code: 'FORBIDDEN_ORIGIN' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      const details = (error as HttpError & { details?: unknown }).details;
      return reply.code(error.statusCode).send({ error: error.message, code: error.code, details });
    }
    const err = error as Error & { statusCode?: number; validation?: unknown };
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message, code: 'BAD_REQUEST' });
    }
    if (/Path traversal|not allowed/i.test(err.message)) {
      return reply.code(400).send({ error: err.message, code: 'PATH_NOT_ALLOWED' });
    }
    request.log.error(error);
    return reply.code(500).send({ error: err.message || 'Internal error', code: 'INTERNAL' });
  });

  const health = async () => {
    const provider = providerRegistry.getDefaultProvider();
    return {
      status: 'ok',
      apiKeyConfigured: Boolean(config.geminiApiKey),
      generation: provider
        ? { available: true, providerId: provider.id, model: provider.model }
        : { available: false, reason: 'API_KEY_MISSING', message: API_KEY_MISSING_MESSAGE },
      providers: providerRegistry.listProviders().map((p) => ({ id: p.id, name: p.name, model: p.model })),
      allowedRoots: config.allowedRoots,
    };
  };
  app.get('/health', health);
  app.get('/api/health', health);

  await app.register(projectsRoutes, { prefix: '/api', storage });
  await app.register(generateRoutes, { prefix: '/api', storage, providerRegistry });
  await app.register(manifestRoutes, { prefix: '/api', storage });
  await app.register(audioRoutes, { prefix: '/api', storage });

  return app;
}
