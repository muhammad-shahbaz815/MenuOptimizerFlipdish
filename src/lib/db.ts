import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export type CloudflareEnv = {
  DB: D1Database;
};

export const getDb = (): D1Database => {
  const env = getCloudflareContext().env as CloudflareEnv;
  if (!env?.DB) {
    throw new Error(`Missing D1 binding. env keys: ${Object.keys(env ?? {}).join(', ') || '(none)'}`);
  }
  return env.DB;
};

export const nowIso = () => new Date().toISOString();
