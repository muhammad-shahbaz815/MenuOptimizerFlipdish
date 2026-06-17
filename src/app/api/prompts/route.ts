import { slimMenu } from '@/lib/prompts/slim-menu';
import { buildAnalyzePrompt } from '@/lib/prompts/analyze-prompt';
import { buildReviewPrompt } from '@/lib/prompts/review-prompt';
import { buildBasicAnalysisPrompt } from '@/lib/prompts/basic-analysis-prompt';
import { pickModelForRun } from '@/lib/anthropic-config';

export const runtime = 'edge';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'Request body must be JSON' }, 400); }

  const menu = body?.menu;
  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];
  const firstPassAudit = String(body?.firstPassAudit || '').trim();

  const mode = String(body?.mode || '').toLowerCase();
  const useBasicAnalysis = mode === 'basic';

  let analyzePrompt: string | null = null;
  let reviewPrompt: string | null = null;
  let slimStats: { original_chars: number; slimmed_chars: number; reduction_pct: number } | null = null;
  let slimmedJson = '[upload a menu JSON to see this prompt populated]';

  if (menu) {
    const slim = slimMenu(menu);
    slimmedJson = JSON.stringify(slim, null, 2);
    const original = JSON.stringify(menu);
    slimStats = {
      original_chars: original.length,
      slimmed_chars: slimmedJson.length,
      reduction_pct: original.length ? Math.round((1 - slimmedJson.length / original.length) * 1000) / 10 : 0,
    };
  }

  if (useBasicAnalysis) {
    analyzePrompt = buildBasicAnalysisPrompt({ menuJson: slimmedJson });
    reviewPrompt = '(Review pass is skipped in Basic Analysis mode — basic mode is single-pass by design.)';
  } else {
    analyzePrompt = buildAnalyzePrompt({ menuJson: slimmedJson, location, reports });
    reviewPrompt = buildReviewPrompt({
      menuJson: slimmedJson,
      location,
      reports,
      firstPassAudit: firstPassAudit ||
        '(no first-pass audit yet — run the analysis first to see the actual first-pass output injected here)',
    });
  }

  const useExtendedThinking = body?.useExtendedThinking !== false;
  const webSearchOn = process.env.ENABLE_WEB_SEARCH === 'true';
  const maxTokens = useExtendedThinking
    ? (webSearchOn ? 32000 : 40000)
    : (webSearchOn ? 24000 : 32000);

  const useSonnet = body?.useSonnet === true;
  const selection = pickModelForRun({
    menuChars: slimmedJson?.length || 0,
    useSonnet,
  });
  return json({
    model: selection.model,
    long_context: selection.longContext,
    long_context_reason: selection.reason,
    max_tokens: maxTokens,
    extended_thinking: useExtendedThinking,
    thinking_budget_tokens: useExtendedThinking ? 8000 : 0,
    web_search: webSearchOn,
    basic_mode: useBasicAnalysis,
    location,
    reports_count: reports.length,
    slim_stats: slimStats,
    analyze: analyzePrompt,
    review: reviewPrompt,
  });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
