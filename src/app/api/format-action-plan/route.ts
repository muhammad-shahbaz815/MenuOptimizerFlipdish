import { buildActionPlanPrompt } from '@/lib/prompts/action-plan-prompt';
import { buildSystemPrompt } from '@/lib/prompts/system-prompt';
import { MODEL, pickModel } from '@/lib/anthropic-config';

export const runtime = 'edge';

export async function POST(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY env var' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const auditText = String(body?.auditText || '').trim();
  if (!auditText) {
    return new Response(JSON.stringify({ error: 'Missing auditText' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const useSonnet = body?.useSonnet === true;
  const prompt = buildActionPlanPrompt({ auditText });

  const payload = {
    model: pickModel(useSonnet),
    max_tokens: 16000,
    stream: true,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  };

  const anthropicHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  // prepare=true: return payload + credentials for browser-direct calling.
  const url = new URL(req.url);
  if (url.searchParams.get('prepare') === 'true') {
    return new Response(JSON.stringify({ payload, anthropicHeaders }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
