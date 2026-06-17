# Menu Optimizer Flipdish

Internal Flipdish tooling for menu analysis and preview.

## Tools

- **Menu Optimizer** (`/optimizer`) — AI-powered menu audit using Claude. Upload a Flipdish menu JSON and get a detailed analysis with recommendations.
- **Menu Preview** (`/preview`) — Side-by-side menu comparison and reviewer tool for previewing menus from customer and staff perspectives.

## Stack

- Next.js 15 + React 19
- Cloudflare Workers (via OpenNext)
- Cloudflare D1 (SQLite) + Supabase (reviewer sessions/comments)
- NextAuth v5 (Flipdish OAuth)
- TypeScript, Biome, Vitest, Tailwind CSS + MUI

## Getting started

```bash
cp .env.example .env.local
# Fill in env vars
npm install
npm run dev
```

See CLAUDE.md for development conventions.
