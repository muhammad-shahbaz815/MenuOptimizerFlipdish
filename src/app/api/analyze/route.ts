import { slimMenu, chunkMenuByCategories } from '@/lib/prompts/slim-menu';
import { buildAnalyzePrompt } from '@/lib/prompts/analyze-prompt';
import { buildBasicAnalysisPrompt } from '@/lib/prompts/basic-analysis-prompt';
import { buildTestPrompt } from '@/lib/prompts/test-prompt';
import { buildSystemPrompt } from '@/lib/prompts/system-prompt';
import { SONNET_MODEL, LONG_CONTEXT_BETA, pickModelForRun } from '@/lib/anthropic-config';

export const runtime = 'edge';

// Above this slimmed-menu size, the menu won't fit in a single Sonnet 1M
// call (after subtracting prompt, supporting reports, thinking budget,
// and output reservation from the 1M context). We split categories
// across N sequential LLM calls and stream their outputs back as one
// combined SSE stream with "Part X of N" separators.
const MAX_JSON_PER_CHUNK = 2_600_000;

// Slimmed-menu size budget.
const MAX_MENU_CHARS = 5_000_000;

export async function POST(req: Request) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY env var' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // prepare=true: return the Anthropic payload + credentials as JSON so the
  // browser can call Anthropic directly (no timeout involvement).
  const url = new URL(req.url);
  const prepareOnly = url.searchParams.get('prepare') === 'true';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const menu = body?.menu;
  if (!menu) {
    return new Response(JSON.stringify({ error: 'Missing "menu" field in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];

  const slim = slimMenu(menu);
  const menuJson = JSON.stringify(slim, null, 2);

  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, which exceeds the ${(MAX_MENU_CHARS / 1000)}KB server-side budget. ` +
             `Even the 1M-token context window tops out at ~4MB of JSON. Try splitting the menu into sections or remove unused / disabled items before uploading.`
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  const mode = String(body?.mode || '').toLowerCase();
  const useBasicAnalysis = mode === 'basic';
  const useTestPrompt = body?.useTestPrompt === true;
  const prompt = useTestPrompt
    ? buildTestPrompt({ menuJson, location, reports })
    : useBasicAnalysis
      ? buildBasicAnalysisPrompt({ menuJson })
      : buildAnalyzePrompt({ menuJson, location, reports });

  const useExtendedThinking = body?.useExtendedThinking !== false;
  const enableWebSearch = process.env.ENABLE_WEB_SEARCH === 'true';

  const maxTokens = useExtendedThinking
    ? (enableWebSearch ? 32000 : (useTestPrompt ? 64000 : 40000))
    : (enableWebSearch ? 24000 : (useTestPrompt ? 64000 : 32000));

  const useSonnet = body?.useSonnet === true;
  const forceLongContext = body?.forceLongContext === true;
  const selection = pickModelForRun({
    menuChars: menuJson.length,
    useSonnet,
    forceLongContext,
  });
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

  // ── Chunked branch ────────────────────────────────────────────────────
  if (!useBasicAnalysis && menuJson.length > MAX_JSON_PER_CHUNK) {
    const numChunks = Math.ceil(menuJson.length / MAX_JSON_PER_CHUNK);
    const chunks = chunkMenuByCategories(slim, numChunks);
    if (chunks && chunks.length > 1) {
      const chunkHeaders = { ...anthropicHeaders, 'anthropic-beta': LONG_CONTEXT_BETA };

      if (prepareOnly) {
        const chunkPayloads = chunks.map((chunk: unknown, i: number) => {
          const chunkMenuJson = JSON.stringify(chunk, null, 2);
          const basePrompt = buildAnalyzePrompt({ menuJson: chunkMenuJson, location, reports });
          const chunkPrompt =
            `IMPORTANT: This is part ${i + 1} of ${chunks.length} of a large menu that has been split for analysis. ` +
            `You see only a subset of the categories. Compute all metrics, percentages, and analyses for the ` +
            `categories visible in this part only — do NOT claim totals across the whole menu. The human will ` +
            `combine your output with the other parts.\n\n` +
            basePrompt;
          const p: Record<string, unknown> = {
            model: SONNET_MODEL,
            max_tokens: maxTokens,
            stream: true,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: chunkPrompt }],
          };
          if (useExtendedThinking) p.thinking = { type: 'enabled', budget_tokens: 8000 };
          return p;
        });
        return new Response(JSON.stringify({
          chunks: chunkPayloads,
          anthropicHeaders: chunkHeaders,
          meta: { longContext: true, model: SONNET_MODEL, numChunks: chunks.length },
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      return streamChunkedAnalysis({
        chunks,
        numChunks: chunks.length,
        location,
        reports,
        anthropicHeaders: chunkHeaders,
        useExtendedThinking,
        enableWebSearch,
        maxTokens,
        modelSelectionMeta: { model: SONNET_MODEL, longContext: true },
      });
    }
  }

  // ── prepare=true: return payload + credentials, browser calls Anthropic ──
  if (prepareOnly) {
    return new Response(JSON.stringify({
      payload,
      anthropicHeaders,
      meta: { longContext: selection.longContext, model: selection.model, numChunks: 1 },
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── Standard server-side streaming ──
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

function streamChunkedAnalysis({
  chunks,
  numChunks,
  location,
  reports,
  anthropicHeaders,
  useExtendedThinking,
  enableWebSearch,
  maxTokens,
  modelSelectionMeta,
}: {
  chunks: unknown[];
  numChunks: number;
  location: string;
  reports: unknown[];
  anthropicHeaders: Record<string, string>;
  useExtendedThinking: boolean;
  enableWebSearch: boolean;
  maxTokens: number;
  modelSelectionMeta: { model: string; longContext: boolean };
}) {
  const encoder = new TextEncoder();

  function sseTextEvent(text: string) {
    const obj = { type: 'content_block_delta', delta: { type: 'text_delta', text } };
    return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let i = 0; i < chunks.length; i++) {
          const sep = i === 0
            ? `# Part ${i + 1} of ${numChunks} — Menu Audit\n\n`
            : `\n\n---\n\n# Part ${i + 1} of ${numChunks} — Menu Audit\n\n`;
          controller.enqueue(sseTextEvent(sep));

          const chunkMenuJson = JSON.stringify(chunks[i], null, 2);
          const basePrompt = buildAnalyzePrompt({ menuJson: chunkMenuJson, location, reports });
          const chunkPrompt =
            `IMPORTANT: This is part ${i + 1} of ${numChunks} of a large menu that has been split for analysis. ` +
            `You see only a subset of the categories. Compute all metrics, percentages, and analyses for the ` +
            `categories visible in this part only — do NOT claim totals across the whole menu. The human will ` +
            `combine your output with the other parts.\n\n` +
            basePrompt;

          const payload: Record<string, unknown> = {
            model: modelSelectionMeta.model,
            max_tokens: maxTokens,
            stream: true,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: chunkPrompt }],
          };
          if (useExtendedThinking) payload.thinking = { type: 'enabled', budget_tokens: 8000 };
          if (enableWebSearch) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

          const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: anthropicHeaders,
            body: JSON.stringify(payload),
          });

          if (!upstream.ok) {
            const errText = await upstream.text();
            controller.enqueue(sseTextEvent(`\n\n[Part ${i + 1} of ${numChunks} failed: ${errText.slice(0, 300)}]\n\n`));
            continue;
          }

          const reader = upstream.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (e) {
        controller.enqueue(sseTextEvent(`\n\n[Chunked analysis aborted: ${String((e as Error)?.message || e).slice(0, 300)}]\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Long-Context': '1',
      'X-Chunked': String(numChunks),
      'X-Model-Used': modelSelectionMeta.model,
    },
  });
}
