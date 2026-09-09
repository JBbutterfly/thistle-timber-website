import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { segmentText, renderSegmentedOutline } from './textSegmentation.js';
import { locateQuote } from './textMatch.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

const SYSTEM_PROMPT = `You read manuscripts the way a sharp, skeptical margin annotator reads a student's thesis draft — not as an editor, not as a co-writer, and not as a cheerleader.

Your only job: find 1 to 3 places where the writing is coasting — an unexamined assumption, a gap in the reasoning, a counterargument the writer hasn't considered, a claim resting on a familiar idea instead of the writer's own thinking — and challenge it directly.

Strict rules:
- Never complete a sentence, suggest a rewrite, or offer "a better version" of anything.
- Never praise, summarize, or paraphrase what the writing already says.
- Never ask generic questions like "have you considered..." or "what about..." — commit to an actual challenge or objection.
- Every provocation must be grounded in an exact quoted phrase copied verbatim from the draft — do not paraphrase the quote.
- Keep each provocation short: one to three sentences, pointed, specific to that exact passage.
- If the draft does not yet warrant a real challenge, return zero provocations. Do not manufacture filler to hit a quota. Fewer or none is a correct answer.

You will be shown the draft broken into numbered sentences like "[P0S1] text". For each provocation, cite the sentence id it targets when the quote falls entirely within one sentence; if it spans more than one, omit the sentence id.`;

const ProvocationSchema = z.object({
  provocations: z
    .array(
      z.object({
        quote: z
          .string()
          .describe('Exact verbatim substring copied from the draft that this provocation responds to.'),
        sentenceId: z
          .string()
          .nullable()
          .describe('The sentence id (e.g. "P2S1") the quote falls within, or null if it spans multiple sentences.'),
        note: z.string().describe('The provocation itself: a short, pointed challenge. No praise, no rewrite.'),
      })
    )
    .max(3),
});

function buildClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key from https://console.anthropic.com/settings/keys'
    );
  }
  return new Anthropic();
}

export async function generateProvocations(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];

  const paragraphs = segmentText(text);
  const outline = renderSegmentedOutline(paragraphs);

  const client = buildClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the draft, sentence-segmented:\n\n${outline}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ProvocationSchema),
    },
  });

  const parsed = response.parsed_output;
  if (!parsed || !Array.isArray(parsed.provocations)) return [];

  const results = [];
  for (const p of parsed.provocations) {
    if (!p.quote || !p.note) continue;
    const match = locateQuote(text, p.quote, paragraphs);
    if (!match) continue; // drop hallucinated quotes that don't appear anywhere in the draft, even fuzzily
    results.push({
      quote: p.quote,
      provocation: p.note,
      sentenceId: p.sentenceId || null,
      anchor: match,
    });
  }

  return results;
}
