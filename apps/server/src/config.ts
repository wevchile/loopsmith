import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  allowedRoots: string[];
  geminiApiKey?: string;
  googleCloudProject?: string;
  googleCloudLocation?: string;
}

export function loadConfig(): Config {
  const rootsEnv = process.env.LOOPSMITH_ROOTS || './loopsmith-data';
  const roots = rootsEnv.split(',').map(r => path.resolve(r.trim()));

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    host: '127.0.0.1',
    allowedRoots: roots,
    geminiApiKey: process.env.GEMINI_API_KEY,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION,
  };
}
