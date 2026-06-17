import { markdownToNotionBlocks } from '@/lib/markdown-to-notion-blocks';

export const runtime = 'edge';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CHILDREN_PER_REQUEST = 100;

async function detectParent(token: string, parentId: string): Promise<{ type?: string; titleProp?: string; error?: string }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
  };
  const dbRes = await fetch(`${NOTION_API}/databases/${parentId}`, { headers });
  if (dbRes.ok) {
    const db = await dbRes.json() as { properties?: Record<string, { type?: string }> };
    let titleProp: string | null = null;
    for (const [name, def] of Object.entries(db.properties || {})) {
      if (def?.type === 'title') { titleProp = name; break; }
    }
    if (!titleProp) {
      return { error: 'Database has no title property — cannot create rows in it.' };
    }
    return { type: 'database_id', titleProp };
  }
  const pageRes = await fetch(`${NOTION_API}/pages/${parentId}`, { headers });
  if (pageRes.ok) {
    return { type: 'page_id' };
  }
  let detail: string;
  try { detail = await dbRes.text(); } catch { detail = ''; }
  return {
    error: `Parent ID ${parentId} is not accessible as a page or a database. ` +
           `Confirm the integration is added to that object's Connections (Notion ⋯ menu → Connections). ` +
           `Notion said: ${detail.slice(0, 200)}`,
  };
}

function jsonError(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  const token = (process.env.NOTION_TOKEN || '').trim();
  const parentId = (process.env.NOTION_PARENT_PAGE_ID || '').trim();
  if (!token || !parentId) {
    return jsonError(500, 'Server is not configured for Notion (missing NOTION_TOKEN or NOTION_PARENT_PAGE_ID env var).');
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonError(400, 'Request body must be JSON'); }

  const auditMd = String(body?.auditMd || '').trim();
  if (!auditMd) return jsonError(400, 'Missing auditMd');

  const restaurantName = String(body?.restaurantName || 'Menu').trim() || 'Menu';
  const dateStr = String(body?.dateStr || '').trim() ||
    new Date().toISOString().slice(0, 10);

  const title = `${restaurantName} — Menu Audit (${dateStr})`;

  let blocks: unknown[];
  try {
    blocks = markdownToNotionBlocks(auditMd);
  } catch (e) {
    return jsonError(500, 'Failed to convert markdown to Notion blocks: ' + (e as Error).message);
  }
  if (!blocks.length) return jsonError(400, 'Audit markdown produced no Notion blocks');

  const notionHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const parentInfo = await detectParent(token, parentId);
  if (parentInfo.error) return jsonError(404, parentInfo.error);

  const parent = parentInfo.type === 'database_id'
    ? { database_id: parentId }
    : { page_id: parentId };
  const titlePropName = parentInfo.type === 'database_id'
    ? parentInfo.titleProp!
    : 'title';

  const firstChunk = blocks.slice(0, CHILDREN_PER_REQUEST);
  const remaining = blocks.slice(CHILDREN_PER_REQUEST);

  const createRes = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify({
      parent,
      properties: {
        [titlePropName]: { title: [{ type: 'text', text: { content: title } }] },
      },
      children: firstChunk,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return jsonError(createRes.status,
      `Notion page creation failed (${createRes.status}): ${errText}`);
  }

  const page = await createRes.json() as { id: string; url: string };

  for (let i = 0; i < remaining.length; i += CHILDREN_PER_REQUEST) {
    const chunk = remaining.slice(i, i + CHILDREN_PER_REQUEST);
    const appendRes = await fetch(`${NOTION_API}/blocks/${page.id}/children`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({ children: chunk }),
    });
    if (!appendRes.ok) {
      const errText = await appendRes.text();
      return new Response(JSON.stringify({
        url: page.url,
        partial: true,
        error: `Page created but appending blocks ${i + CHILDREN_PER_REQUEST}+ failed: ${errText}`,
      }), {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({
    url: page.url,
    diagnostics: {
      auditMdChars: auditMd.length,
      blocksGenerated: blocks.length,
      blocksSent: blocks.length,
      tablesGenerated: (blocks as Array<{ type: string }>).filter(b => b.type === 'table').length,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
