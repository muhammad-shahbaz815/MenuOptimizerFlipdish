import { slimMenu } from '@/lib/prompts/slim-menu';
import { buildReviewPrompt } from '@/lib/prompts/review-prompt';
import { buildSystemPrompt } from '@/lib/prompts/system-prompt';
import { pickModelForRun } from '@/lib/anthropic-config';

export const runtime = 'edge';

const MAX_MENU_CHARS = 5_000_000;

export async function POST(req: Request) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY env var' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const menu = body?.menu;
  if (!menu) {
    return new Response(JSON.stringify({ error: 'Missing "menu" field in request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const firstPassAudit = String(body?.firstPassAudit || '').trim();
  if (!firstPassAudit) {
    return new Response(JSON.stringify({ error: 'Missing firstPassAudit' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];

  const slim = slimMenu(menu);
  const menuJson = JSON.stringify(slim, null, 2);
  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, exceeds the ${(MAX_MENU_CHARS / 1000)}KB server-side budget. Even the 1M-token context window tops out at ~4MB — split the menu or remove unused/disabled items.`,
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  const prompt = buildReviewPrompt({ menuJson, location, reports, firstPassAudit });

  const useExtendedThinking = body?.useExtendedThinking !== false;
  const enableWebSearch = process.env.ENABLE_WEB_SEARCH === 'true';
  const maxTokens = useExtendedThinking
    ? (enableWebSearch ? 32000 : 40000)
    : (enableWebSearch ? 24000 : 32000);

  const useSonnet = body?.useSonnet === true;
  const forceLongContext = body?.forceLongContext === true;
  const selection = pickModelForRun({ menuChars: menuJson.length, useSonnet, forceLongContext });
  const payload: Record<string, unknown> = {
    model: selection.model,
    max_tokens: maxTokens,
    stream: true,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  };
  if (useExtendedThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 8000 };
  }
  if (enableWebSearch) {
    payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }

  const anthropicHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (selection.beta) anthropicHeaders['anthropic-beta'] = selection.beta;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders,
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic API ${upstream.status}: ${errText}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Long-Context': selection.longContext ? '1' : '0',
      'X-Model-Used': selection.model,
    },
  });
}
