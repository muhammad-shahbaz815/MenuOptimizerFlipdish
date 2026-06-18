#!/usr/bin/env node
/**
 * Runs pending D1 migrations in order.
 * Usage: node scripts/db-migrate.js local | prod
 * - local: wrangler.jsonc, no --remote
 * - prod: wrangler.production.jsonc, --remote --yes
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN in env (or .env.local).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const migrationsDir = path.join(root, 'src/lib/db/migrations');
const isProd = process.argv[2] === 'prod';
const config = isProd ? 'wrangler.production.jsonc' : 'wrangler.jsonc';

if (!fs.existsSync(migrationsDir)) {
  console.log('No migrations directory.');
  process.exit(0);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
if (files.length === 0) {
  console.log('No migration files.');
  process.exit(0);
}

const remoteArgs = isProd ? ['--remote', '--yes'] : [];

/** @returns {Set<string>} */
function readAppliedMigrationNames() {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'menu-optimizer-flipdish-db', '--config', config, ...remoteArgs, '--json', '--command=SELECT name FROM schema_migrations'],
    { encoding: 'utf8', cwd: root, env: process.env },
  );
  if (r.status !== 0) {
    console.error('Failed to read schema_migrations (run npm run db:schema or db:schema:prod first).', r.stderr || r.stdout);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout.trim());
  } catch {
    console.error('Unexpected wrangler output when listing migrations:', r.stdout);
    process.exit(1);
  }
  const batch = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = batch && Array.isArray(batch.results) ? batch.results : [];
  return new Set(rows.map((row) => row.name).filter(Boolean));
}

function _runWrangler(args) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'menu-optimizer-flipdish-db', ...args, '--config', config], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  return r.status === 0;
}

const appliedNames = readAppliedMigrationNames();

for (const file of files) {
  const name = path.basename(file, '.sql');
  if (appliedNames.has(name)) {
    console.log(`Skipping migration (already applied): ${file}`);
    continue;
  }

  const filePath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Running migration: ${file}`);

  // Use --command=<sql> so SQL starting with `--` is not parsed as wrangler flags.
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'menu-optimizer-flipdish-db', '--config', config, ...remoteArgs, `--command=${sql}`], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });

  if (r.status !== 0) {
    console.error(`Migration ${file} failed.`);
    process.exit(1);
  }

  const safeName = name.replace(/'/g, "''");
  const insertMigration = `INSERT OR IGNORE INTO schema_migrations (name) VALUES ('${safeName}');`;
  const r2 = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'menu-optimizer-flipdish-db', '--config', config, ...remoteArgs, `--command=${insertMigration}`],
    {
      stdio: 'inherit',
      cwd: root,
      env: process.env,
    },
  );
  if (r2.status !== 0) {
    console.error(`Recording migration ${file} failed.`);
    process.exit(1);
  }
}

console.log('Migrations complete.');
