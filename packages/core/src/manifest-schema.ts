import { z } from 'zod';

export const soundTypeSchema = z.enum(['SOUNDTRACK', 'SFX', 'VO', 'AMBIENCE', 'OTHER']);

export const loopMarkersSchema = z.object({
  start: z.number(),
  end: z.number(),
}).optional();

export const manifestEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: soundTypeSchema,
  folder: z.string(),
  relativePath: z.string(),
  hash: z.string().optional(),
  duration: z.number().optional(),
  loopMarkers: loopMarkersSchema,
});

export const manifestSchema = z.object({
  version: z.string(),
  gameRepo: z.string(),
  entries: z.array(manifestEntrySchema),
  lastSync: z.string().optional(),
});

export type ManifestSchema = z.infer<typeof manifestSchema>;
