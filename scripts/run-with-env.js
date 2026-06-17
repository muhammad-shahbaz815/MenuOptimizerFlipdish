#!/usr/bin/env node
/**
 * Loads .env and .env.local into process.env, then runs the given command.
 * Usage: node scripts/run-with-env.js <cmd> [args...]
 * Example: node scripts/run-with-env.js npx wrangler d1 execute ...
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();

for (const file of ['.env', '.env.local']) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    val = val.replace(/\s*#.*$/, '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    process.env[key] = val;
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/run-with-env.js <cmd> [args...]');
  process.exit(1);
}

const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, cwd: root });
process.exit(r.status ?? 1);
