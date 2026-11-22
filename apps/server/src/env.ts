import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Repository root. This file lives in apps/server/src (dev, via tsx) or apps/server/dist (build),
 * so the root is always three levels up. Used to load the root .env and to resolve relative roots,
 * no matter which folder the process was started from (pnpm runs scripts inside apps/server).
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function loadEnvFile(repoRoot: string = REPO_ROOT): void {
  dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true } as dotenv.DotenvConfigOptions);
}
