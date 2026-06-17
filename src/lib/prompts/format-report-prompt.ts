// Format-report prompt — third pass that takes the analyzed (and optionally
// reviewed) audit and reformats it into a polished, client-ready deliverable.
//
// Triggered by the "Create PDF" button. The endpoint is /api/format-report.
// The output is then handed to /api/render-pdf for the visual PDF render.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
//
//   ${auditText}        the current on-screen audit (analyze, or
//                       analyze+review when the confirmatory check ran)
//   ${locationLine}     "LOCATION: <addr>" or empty
//   ${reportsBlock}     supporting reports verbatim, or empty
//
// To refine the wording or the formatting rules: edit the literal text below.

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildFormatReportPrompt({ auditText, location, reports }: { auditText: string; location?: string; reports?: Array<{ name?: string; content?: string }> }) {
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

  return `You are a senior consultant finalising an internal draft audit into a polished, client-ready report. The client will receive this as a styled PDF deliverable.

Below is the draft audit. Reformat it for the PDF deliverable following the rules below.
${locationLine}
═══════════════════════════════════════════════════════════════════════════
FORMATTING RULES — strictly non-negotiable
═══════════════════════════════════════════════════════════════════════════
- No H1 (#) inside the body. The PDF cover renders the document title separately.
- Use ## for top-level sections and ### for sub-sections. Use ### LIBERALLY to add depth — break long sections into multiple clearly labelled sub-parts. The depth of sub-sectioning is what makes this report feel professional.
- Tables MUST be valid GitHub-flavoured Markdown: header row, then a separator row with at least three dashes per column (\`|---|---|---|\`), then data rows. Every row on its own line. Never use inline-pipes-on-one-line.
- Use **bold** for emphasis on key terms — item names, severity flags, totals.
- Use *italics* sparingly for editorial asides.
- Use bullet lists (\`- \`) for enumerations.
- Use numbered lists ONLY for prioritised orderings.
- Do not use emoji except the ✓ / ✗ marks where coverage / pass-fail status is being indicated.
- Currency: £ symbol with two decimals (£14.95) unless the source uses whole pounds.

═══════════════════════════════════════════════════════════════════════════
WHAT TO DO TO THE DRAFT
═══════════════════════════════════════════════════════════════════════════
- Preserve every finding, number, and recommendation from the draft. Do NOT drop sections, do NOT change numeric facts, do NOT invent new findings.
- Reorganise the structure where doing so makes the report clearer to a non-expert reader.
- Add ### sub-headings wherever the draft has dense paragraphs that could be broken up.
- Convert prose into tables where the content is naturally tabular:
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
NOW OUTPUT THE POLISHED CLIENT REPORT IN FULL.
═══════════════════════════════════════════════════════════════════════════
Begin directly with the first \`## \` section heading. No preamble. No
"Here is the polished report" introduction. No closing remarks after the
final section. The PDF cover renders the title and metadata separately, so
do not add a title or date line at the top.`;
}
