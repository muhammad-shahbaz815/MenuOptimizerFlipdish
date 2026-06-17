#!/usr/bin/env node
/**
 * Injects Worker variables (non-secret env) into the production wrangler config
 * and writes wrangler.production.deploy.jsonc. Use this in CI before deploy so
 * GOOGLE_CLIENT_ID, NEXTAUTH_URL are set as Variables.
 *
 * Usage: node scripts/inject-worker-vars.js
 * Or:    npm run inject-worker-vars
 *
 * Requires: GOOGLE_CLIENT_ID, NEXTAUTH_URL in env.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const configPath = path.join(root, 'wrangler.production.jsonc');
const outPath = path.join(root, 'wrangler.production.deploy.jsonc');

const VAR_NAMES = ['GOOGLE_CLIENT_ID', 'NEXTAUTH_URL'];

function isMissingEnvValue(value) {
  return value === undefined || value.trim() === '';
}

function getMissingEnv(names) {
  return names.filter((name) => isMissingEnvValue(process.env[name]));
}

function stripJsonc(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
}

const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(stripJsonc(raw));

const missingVars = getMissingEnv(VAR_NAMES);
if (missingVars.length > 0) {
  console.error(`[inject-worker-vars] Missing required env vars: ${missingVars.join(', ')}. Ensure each variable is set and not empty.`);
  process.exit(1);
}

const vars = {};
for (const name of VAR_NAMES) {
  vars[name] = process.env[name];
}

console.log('[inject-worker-vars] Injecting vars:', Object.keys(vars).join(', '));

config.vars = { ...config.vars, ...vars };
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), 'utf8');
console.log('[inject-worker-vars] Wrote', path.basename(outPath));
