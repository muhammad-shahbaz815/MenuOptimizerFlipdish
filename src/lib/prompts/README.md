# Prompts

Every prompt the Menu Analyzer sends to Claude lives in this directory. The
`api/*.js` route handlers are thin shells that import a prompt-builder, call
the Anthropic API, and stream the response back. To refine prompt wording,
edit the file here — no API logic in the way.

| File | What it does |
|---|---|
| `analyze-prompt.js` | The single-pass audit prompt sent by `/api/analyze` on Full Optimize runs. The operator's spec, verbatim. Returns a builder `buildAnalyzePrompt({ menuJson, location, reports })`. The `location` parameter is accepted for call-site compatibility but is not referenced inside the prompt body. |
| `old-analyze-prompt.js` | The previous "high-value Cave consultant" Full-Optimize prompt, preserved verbatim. Nothing imports it — kept only so we can roll back or compare if the new analyze prompt underperforms. |
| `format-report-prompt.js` | Third-pass prompt sent by `/api/format-report` when the user clicks **Create PDF**. Reformats the audit into a client-ready report with deep `###` sub-sectioning, prose-to-table conversion, and strict GFM rules. Returns `buildFormatReportPrompt({ auditText, location, reports })`. |
| `format-notion-prompt.js` | Notion-tuned variant of the format pass. Sent by `/api/format-notion` when the user clicks **Download for Notion**, and also by `/api/send-to-notion` when the user clicks **Send to Notion** (which converts the result to Notion blocks and creates a page directly). Same draft-input contract as `format-report-prompt.js` but with Notion-specific rules: strict GFM only (no HTML / no `<details>` / no `═══` Unicode dividers), emoji-prefixed `##` headings for scan-ability in Notion's outline view, `>` blockquote callouts (render as Notion Quote blocks), and a "no body H1" rule (Notion treats H1 as the page title). Returns `buildFormatNotionPrompt({ auditText, location, reports })`. |
| `basic-analysis-prompt.js` | Single-pass structural audit prompt. `/api/analyze` swaps to it when the request body has `mode: 'basic'` — triggered by the **Basic Analysis** button, which is auto-suggested when the user uploads a menu JSON without supporting reports. The operator's spec, verbatim. Covers menu structure, coverage analysis with per-category coverage table, visual merchandising risk levels, navigation/UX, misclassification, and a prioritised action plan. |
| `old-basic-analysis-prompt.js` | The previous "elite menu growth consultant" basic prompt, preserved verbatim. Nothing imports it — kept only so we can roll back or compare if the new basic prompt underperforms. |
| `review-prompt.js` | Confirmatory-review prompt sent by `/api/review` when the user has the "Run confirmatory check" toggle on. Takes the first-pass audit as **primary input**, re-parses the menu JSON + CSVs, verifies every quantitative claim against the source, silently corrects wrong numbers, tightens vague language into prescriptive recommendations, fills any genuinely-missing required section, and re-emits the audit in the same Required Sections / Output Format as the first pass. Same "high-value menu consultant" voice as `analyze-prompt.js`. Returns `buildReviewPrompt({ menuJson, location, reports, firstPassAudit })`; `location` is accepted for call-site compatibility but not referenced in the prompt body. |
| `old-review-prompt.js` | The previous confirmatory-review prompt (which DID inject the first-pass audit as context), preserved verbatim. Nothing imports it — kept only for rollback / comparison. |
| `gold-standard.js` | The structural/depth reference used by the previous review pass. NOT a fact source — the reviewer was instructed not to copy restaurant-specific items/prices from it. The new review-prompt.js does not reference this file. |
| `slim-menu.js` | Sanitiser that strips base64 images, HTML tags, and oversize strings from the menu before serializing into the analyze prompt. |

## Workflow

1. Edit a file here.
2. Commit and push to `main`.
3. Vercel redeploys; new prompts take effect on the next request.

## Inspecting prompts in the browser

The "View prompts" link in the page footer opens a modal that calls
`/api/prompts` with the user's current inputs (uploaded menu, location,
supporting reports, last first-pass audit) and shows the exact analyze and
review prompts that would be sent to Claude. The modal also reports the
slim-menu reduction (original KB → slimmed KB), model id, and `max_tokens`.

`/api/prompts` is non-streaming and never calls Anthropic — it just runs the
builders in this directory and returns the strings as JSON. Useful when
iterating on wording.

## Where to add new prompts

If you add a third pass (e.g. a separate formatting pass), create a new
`*-prompt.js` builder here, then add a thin handler under `api/` that imports
it and posts to Anthropic. Keep all wording in `lib/prompts/`.
