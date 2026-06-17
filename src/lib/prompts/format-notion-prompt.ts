// Format-Notion prompt — Notion-tuned variant of the format-report pass.
//
// Triggered by the "Download for Notion" button on the tool. The endpoint
// is /api/format-notion. The output is sanitised client-side and saved as
// a .md file ready to paste or import into Notion.
//
// Conceptually a "skill": a focused, reusable recipe for one job —
// turning a draft audit into Notion-ready Markdown. Same draft-input
// contract as format-report-prompt.js so the two endpoints are
// interchangeable on the client side.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
//
//   ${auditText}     the current on-screen audit
//   ${locationLine}  "LOCATION: <addr>" or empty
//   ${reportsBlock}  supporting reports verbatim, or empty
//
// To refine the wording or the formatting rules: edit the literal text below.

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildFormatNotionPrompt({ auditText, location, reports }: { auditText: string; location?: string; reports?: Array<{ name?: string; content?: string }> }) {
  const reportsBlock = reports && reports.length
    ? `\n\n▼ BEGIN SUPPORTING REPORTS (reference only — verify figures and pull additional detail; do NOT paste verbatim into the report)\n` +
      FENCE + '\n' +
      reports
        .map(r =>
          `=== ${String(r?.name || 'report').slice(0, 120)} ===\n` +
          `${String(r?.content || '').slice(0, 30000)}`)
        .join('\n\n') +
      '\n' + FENCE + '\n' +
      '▲ END SUPPORTING REPORTS'
    : '';

  const locationLine = location ? `\nLOCATION: ${location}\n` : '';

  return `You are a senior consultant finalising an internal draft audit into a polished Markdown document the client will paste or import into Notion.

Below is the draft audit. Reformat it for Notion following the rules below.
${locationLine}
═══════════════════════════════════════════════════════════════════════════
FORMATTING RULES — strictly non-negotiable
═══════════════════════════════════════════════════════════════════════════
- Output strict GitHub-Flavoured Markdown ONLY. Absolutely no HTML tags, no inline styles, no \`<div>\`, \`<span>\`, \`<table>\`, \`<font>\`, or \`<br>\`. Notion's import strips HTML and the result is broken.
- No H1 (#) inside the body — Notion treats H1 as the page title and a body H1 collides. Use \`## \` for top-level sections and \`### \` for sub-sections. Use \`### \` LIBERALLY so the document is easy to scan in Notion's outline view.
- Prefix every \`## \` heading with a single relevant emoji for scan-ability, e.g. \`## 📊 Menu Composition\`, \`## 🎯 Strategic Recommendations\`, \`## ⚠️ Misclassification Detection\`, \`## 💰 Revenue Opportunities\`, \`## 🍽️ Per-Category Breakdown\`. One emoji per \`## \` heading. Do NOT add emoji to \`### \` sub-headings or to body text.
- Tables MUST be valid GFM: header row, then a separator row with at least three dashes per column (\`|---|---|---|\`), then data rows. Every row on its own line. Never inline-pipe a table on a single line. Never use HTML tables.
- Use \`**bold**\` for emphasis on key terms — item names, severity flags, totals.
- Use \`*italics*\` sparingly for editorial asides.
- Use \`-\` for bullet lists. Use numbered lists ONLY for prioritised orderings (1, 2, 3 = ranked).
- Use \`> \` blockquotes for "Key Observation", "Important", or "Caveat" callouts — Notion renders these as Quote blocks, which read clearly.
- Use \`---\` (three hyphens on its own line) for horizontal rules between major sections. Do NOT use Unicode box-drawing characters like \`═══\` or \`────\` — those render as literal text in Notion.
- Currency: £ symbol with two decimals (£14.95) unless the source uses whole pounds.
- Do NOT use \`<details>\` / \`<summary>\` collapsibles — Notion doesn't render them.
- Do NOT wrap normal prose in code fences. Reserve \`\`\` for genuinely code-like content (JSON snippets, field names, etc.).

═══════════════════════════════════════════════════════════════════════════
WHAT TO DO TO THE DRAFT
═══════════════════════════════════════════════════════════════════════════
- Preserve every finding, number, and recommendation from the draft. Do NOT drop sections, do NOT change numeric facts, do NOT invent new findings.
- Reorganise the structure where doing so makes the report clearer to a non-expert reader pasting this into a Notion page.
- Add \`### \` sub-headings wherever the draft has dense paragraphs that could be broken up. Notion's outline view rewards this.
- Convert prose into GFM tables where the content is naturally tabular:
    • counts and totals
    • side-by-side comparisons (current vs recommended, before vs after)
    • "currently in / should be in / why" mappings
    • upsell prompts (when customer adds | prompt | type)
    • deal proposals (name | window | price | target | rationale)
    • per-category breakdowns
- Tighten language. Cut filler. Sharpen recommendations into prescriptive one-liners that name a specific item, price, and reason.
- Where the draft has freeform bullet items like "Name — £X.XX — current location — should be — reason", convert them into multi-column Markdown tables.

═══════════════════════════════════════════════════════════════════════════
DRAFT AUDIT  (your raw material — reformat, do not rewrite the substance)
═══════════════════════════════════════════════════════════════════════════
▼ BEGIN DRAFT AUDIT
${FENCE}
${auditText}
${FENCE}
▲ END DRAFT AUDIT${reportsBlock}

═══════════════════════════════════════════════════════════════════════════
NOW OUTPUT THE POLISHED NOTION-READY MARKDOWN IN FULL.
═══════════════════════════════════════════════════════════════════════════
Begin directly with the first \`## \` section heading. No preamble. No HTML. No code fences around the whole output. Just Markdown.`;
}
