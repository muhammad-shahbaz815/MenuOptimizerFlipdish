// System prompt sent with every Anthropic call.
//
// Without a system prompt, Claude through the bare Messages API lacks the
// scaffolding that claude.ai injects automatically — current date, persona,
// formatting preferences, tool-use guidance. This builder produces a
// consistent system prompt for the analyze + review + test passes so the
// model gets the same baseline context as a claude.ai chat would.
//
// To refine: edit the literal text below.

export function buildSystemPrompt({ today } = {}) {
  const dateStr = today || new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Deliberately minimal — close to what claude.ai itself sends. The user
  // prompt drives persona, format, and depth; the system prompt only
  // establishes identity and current date. Anything beyond that risks
  // overriding what the user prompt is asking for.
  return `You are Claude, an AI assistant made by Anthropic.

Today's date is ${dateStr}.

Approach the user's task carefully and thoroughly. When the task involves quantitative analysis, cite the specific source for every figure you report.`;
}
