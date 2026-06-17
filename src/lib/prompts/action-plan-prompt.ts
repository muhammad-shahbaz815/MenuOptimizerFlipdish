// Second-pass prompt for test prompt mode. Takes the completed audit report
// and produces only Section 13 — the self-contained action plan summary.
// Runs as a separate API call so it never competes with the main report's
// token budget.

export function buildActionPlanPrompt({ auditText }: { auditText: string }) {
  return `You are a senior menu growth consultant. You have just written the full menu audit report below. Your task now is to write **Section 13: Action Plan Summary** — a self-contained, exhaustive task list drawn entirely from the findings and recommendations already stated in the report above.

Do not introduce any new analysis, new figures, or new recommendations. Every item in this section must reference something already stated in the report. Do not repeat or restate the full analysis paragraphs — this section is a clean action list only.

Output Section 13 in full, using this exact structure:

---

## 13. ACTION PLAN SUMMARY

### ⚡ Quick Wins — 1 to 2 Days
*Actions requiring no photography: text fixes, back-end configuration changes, modifier group additions, dietary tag applications.*

For each action write:
- A **bold action title**
- One sentence on exactly what to do (name the specific items, categories, or fields)
- One sentence on why it matters or what it unlocks
- Estimated annual uplift in parentheses if one was stated in the report

### 📅 Medium Term — 7 Days
*Actions requiring photography, content writing, or moderate back-end work.*

Same format as above.

### 🗓️ Long Term — 30 Days
*Actions requiring structural changes: category restructuring, consolidation, renaming, retention programme setup, or pricing strategy decisions.*

Same format as above.

### 💰 Combined 30-Day Uplift

A single markdown table:

| Action | Effort | Est. Annual Uplift | Confidence |

Include every Quick Win and Medium Term action that has a stated revenue figure from the report.

Below the table write one short paragraph: the total estimated monthly uplift if all Quick Win and Medium Term actions are completed within 30 days, the single largest long-term opportunity and its estimated annual figure, and a one-sentence closing commercial verdict.

---

TONE: Direct and specific. Name every item, category, and price point from the audit. Actionable by a restaurant manager reading on a phone. No hedging, no padding.

---

AUDIT REPORT:
${auditText}`;
}
