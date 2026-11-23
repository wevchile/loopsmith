import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig(({ mode }) => {
  // Read LOOPSMITH_* settings from the repository root .env (only non secret values are used here).
  const env = loadEnv(mode, repoRoot, 'LOOPSMITH_');
  const webPort = Number(env.LOOPSMITH_WEB_PORT || 3000);
  const serverPort = Number(env.LOOPSMITH_SERVER_PORT || 3001);

  return {
    plugins: [react()],
    envDir: repoRoot,
    envPrefix: 'LOOPSMITH_PUBLIC_',
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      open: env.LOOPSMITH_OPEN_BROWSER !== 'false',
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
