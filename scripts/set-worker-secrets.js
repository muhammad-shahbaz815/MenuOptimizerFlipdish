#!/usr/bin/env node
/**
 * Set Cloudflare Worker secrets from environment variables.
 *
 * Usage: node scripts/set-worker-secrets.js
 *        npm run worker-secrets:prod   (loads .env.local via run-with-env)
 *
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and the secret names
 * below in the environment. In CI, pass from GitHub Actions secrets.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();

const WORKER_SECRETS = [
  {
    config: path.join(root, 'wrangler.production.jsonc'),
    secrets: ['NEXTAUTH_SECRET', 'GOOGLE_CLIENT_SECRET'],
  },
];

const REQUIRED_WORKER_ENV_VARS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

function isMissingEnvValue(value) {
  return value === undefined || value.trim() === '';
}

function getMissingEnv(names) {
  return names.filter((name) => isMissingEnvValue(process.env[name]));
}

function setSecret(wranglerConfig, name, value) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name, '--config', wranglerConfig], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: root,
    encoding: 'utf8',
  });
  return { ok: r.status === 0 };
}

let hadError = false;
const requiredSecretNames = WORKER_SECRETS.flatMap(({ secrets }) => secrets);
const missingVars = getMissingEnv([...REQUIRED_WORKER_ENV_VARS, ...requiredSecretNames]);

if (missingVars.length > 0) {
  console.error(`[set-worker-secrets] Missing required env vars: ${missingVars.join(', ')}. Ensure each variable is set and not empty.`);
  process.exit(1);
}

for (const { config, secrets } of WORKER_SECRETS) {
  for (const name of secrets) {
    const value = process.env[name];
    const result = setSecret(config, name, value);
    if (!result.ok) {
      hadError = true;
      console.error(`[fail] ${name} for ${path.basename(config)}`);
    } else {
      console.log(`[ok] ${name} for ${path.basename(config)}`);
    }
  }
}

process.exit(hadError ? 1 : 0);
