// Convert GitHub-flavoured Markdown into Notion's block tree format.
//
// Used by /api/send-to-notion. Notion's REST API takes a typed array of
// block objects (paragraph, heading_2, table, etc.) — not raw markdown —
// so we have to parse our audit text into that shape before POSTing.
//
// Handles the subset the format-notion prompt actually produces:
//   - headings (## → heading_2, ### → heading_3)
//   - paragraphs
//   - bullet lists (-)  and numbered lists (1.)
//   - GFM tables (with header + separator row)
//   - blockquotes (> ...)
//   - horizontal rules (---)
//   - inline **bold**, *italic*, `code`, [label](url)
//
// Limitations (intentional, to keep this small):
//   - no nested list indentation
//   - no headings deeper than ###
//   - no code blocks (audit prompt doesn't emit them)
//   - inline emphasis doesn't nest

const NOTION_RICH_TEXT_LIMIT = 2000;   // per-block content cap
const DEFAULT_ANNOTATIONS = {
  bold: false, italic: false, strikethrough: false,
  underline: false, code: false, color: 'default',
};

function makeText(content, annotationOverrides = {}, link = null) {
  const text = { content: String(content) };
  if (link) text.link = { url: link };
  return {
    type: 'text',
    text,
    annotations: { ...DEFAULT_ANNOTATIONS, ...annotationOverrides },
  };
}

// Inline parser: GFM emphasis / code / links → Notion rich_text[]
function parseInline(text) {
  if (!text) return [makeText('')];
  // Strip a leading stray pipe (the format-pass occasionally emits one).
  let s = String(text);
  if (s.startsWith('|') && s.indexOf('|', 1) === -1) s = s.slice(1).trim();

  const SEGMENT = /\*\*([^*]+)\*\*|__([^_]+)__|(?<![*\w])\*([^*\n]+?)\*(?![*\w])|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  const result = [];
  let lastIndex = 0;
  let match;
  while ((match = SEGMENT.exec(s)) !== null) {
    if (match.index > lastIndex) {
      result.push(...chunkText(s.slice(lastIndex, match.index), {}));
    }
    if (match[1] || match[2]) {
      result.push(...chunkText(match[1] || match[2], { bold: true }));
    } else if (match[3]) {
      result.push(...chunkText(match[3], { italic: true }));
    } else if (match[4]) {
      result.push(...chunkText(match[4], { code: true }));
    } else if (match[5]) {
      result.push(makeText(match[5], {}, match[6]));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < s.length) {
    result.push(...chunkText(s.slice(lastIndex), {}));
  }
  return result.length ? result : [makeText('')];
}

// Notion caps rich_text content at 2000 chars per node — split anything
// longer into multiple text nodes with the same annotations.
function chunkText(content, annotations) {
  const out = [];
  let s = content;
  while (s.length > NOTION_RICH_TEXT_LIMIT) {
    out.push(makeText(s.slice(0, NOTION_RICH_TEXT_LIMIT), annotations));
    s = s.slice(NOTION_RICH_TEXT_LIMIT);
  }
  if (s.length) out.push(makeText(s, annotations));
  return out;
}

const RE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

// Notion's API doesn't expose a "table row background" property, but it
// does allow per-text-run background colors via annotations.color. We
// apply a subtle gray_background to every text run in alternating data
// rows so the table reads as zebra-striped on import.
const ZEBRA_BG = 'gray_background';

function withRowColor(richTextArray, color) {
  if (!color) return richTextArray;
  return richTextArray.map(rt => ({
    ...rt,
    annotations: { ...rt.annotations, color },
  }));
}

function buildTable(lines) {
  const content = lines.filter(ln => !RE_SEP.test(ln));
  if (!content.length) return null;
  const rows = content.map(splitTableRow);
  const width = Math.max(...rows.map(r => r.length));
  if (!width) return null;
  const padded = rows.map(r => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: padded.map((row, rowIndex) => {
        // Row 0 is the header (gets Notion's built-in header styling).
        // Tint every other data row — rows 2, 4, 6 in zero-indexed land,
        // i.e. the 2nd, 4th, 6th data row.
        const stripe = rowIndex > 0 && rowIndex % 2 === 0;
        return {
          object: 'block',
          type: 'table_row',
          table_row: {
            cells: row.map(c => withRowColor(parseInline(c), stripe ? ZEBRA_BG : null)),
          },
        };
      }),
    },
  };
}

function isBlockStart(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^-{3,}\s*$/.test(t)) return true;
  if (t.startsWith('|')) return true;
  if (t.startsWith('> ')) return true;
  if (/^[-*]\s/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  return false;
}

export function markdownToNotionBlocks(md) {
  const lines = String(md || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const s = raw.trim();
    if (!s) { i++; continue; }

    // Headings — # → heading_1, ## → heading_2, ### → heading_3, ####+ → heading_3.
    // Notion heading blocks accept a block-level `color`; we use it to give
    // top-level sections a prominent blue background and sub-sections a
    // subtle gray one. Mirrors the SectionBanner aesthetic from the PDF.
    const headingMatch = s.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      const type = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3';
      const color = level === 2 ? 'red_background'
                  : level === 3 ? 'blue_background'
                  : 'default';
      blocks.push({
        object: 'block',
        type,
        [type]: {
          rich_text: parseInline(headingMatch[2]),
          color,
        },
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(s)) {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      i++;
      continue;
    }

    // Blockquote — accumulate consecutive `> ` lines
    if (s.startsWith('> ')) {
      const parts = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        parts.push(lines[i].trim().slice(2).trim());
        i++;
      }
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: { rich_text: parseInline(parts.join(' ')) },
      });
      continue;
    }

    // Table — 2+ consecutive pipe-prefixed lines with ≥2 pipes each
    if (s.startsWith('|') && (s.match(/\|/g) || []).length >= 2) {
      const tableLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith('|') || (t.match(/\|/g) || []).length < 2) break;
        tableLines.push(t);
        i++;
      }
      if (tableLines.length >= 2) {
        const tb = buildTable(tableLines);
        if (tb) blocks.push(tb);
      } else {
        // Single-line "table" — treat as paragraph instead
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: parseInline(tableLines[0] || s) },
        });
      }
      continue;
    }

    // Bulleted list
    if (/^[-*]\s/.test(s)) {
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^[-*]\s+/, '');
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: parseInline(text) },
        });
        i++;
      }
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(s)) {
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^\d+\.\s+/, '');
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: parseInline(text) },
        });
        i++;
      }
      continue;
    }

    // Paragraph — accumulate consecutive non-blank, non-block-start lines
    const para = [s];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: parseInline(para.join(' ')) },
    });
  }

  return blocks;
}
