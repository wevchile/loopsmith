import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { audioMimeType } from '@loopsmith/providers';
import type { Storage } from '../storage.js';
import { resolveTrackPath } from '../manifest-service.js';

/** Streams a project track (generated, local or from the linked manifest) with HTTP Range support. */
export const audioRoutes: FastifyPluginAsync<{ storage: Storage }> = async (fastify, { storage }) => {
  fastify.get<{ Params: { id: string }; Querystring: { trackId?: string } }>(
    '/projects/:id/audio',
    async (request, reply) => {
      const project = await storage.getProject(request.params.id);
      const filePath = await resolveTrackPath(storage, project, request.query.trackId ?? '');
      const { size } = await stat(filePath);

      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', audioMimeType(filePath));
      reply.header('Cache-Control', 'no-cache');

      const range = request.headers.range;
      const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (match && (match[1] || match[2])) {
        let start: number;
        let end: number;
        if (match[1]) {
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        } else {
          start = Math.max(size - Number(match[2]), 0);
          end = size - 1;
        }
        if (start > end || start >= size) {
          reply.header('Content-Range', `bytes */${size}`);
          return reply.code(416).send();
        }
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
        reply.header('Content-Length', end - start + 1);
        return reply.send(createReadStream(filePath, { start, end }));
      }

      reply.header('Content-Length', size);
      return reply.send(createReadStream(filePath));
    }
  );
};
