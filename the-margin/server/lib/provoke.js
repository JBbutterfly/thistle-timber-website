import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { segmentText, renderSegmentedOutline } from './textSegmentation.js';
import { locateQuote } from './textMatch.js';
import { getAudience } from './audiences.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

function buildSystemPrompt(audienceKey) {
  const audience = getAudience(audienceKey);

  return `You read manuscripts the way a sharp, skeptical margin annotator reads a student's thesis draft — not as an editor, not as a co-writer, and not as a cheerleader.

Your only job: find 1 to 3 places where the writing is coasting, and challenge it directly.

The writer has told you what this piece is: ${audience.label}. ${audience.focus}

Strict rules:
- Never complete a sentence, suggest a rewrite, or offer "a better version" of anything.
- Never praise, summarize, or paraphrase what the writing already says.
- Never ask generic questions like "have you considered..." or "what about..." — commit to an actual challenge or objection.
- Every provocation must be grounded in an exact quoted phrase copied verbatim from the draft — do not paraphrase the quote.
- Keep each provocation short: one to three sentences, pointed, specific to that exact passage.
- If the draft does not yet warrant a real challenge, return zero provocations. Do not manufacture filler to hit a quota. Fewer or none is a correct answer.

You will be shown the draft broken into numbered sentences like "[P0S1] text". For each provocation, cite the sentence id it targets when the quote falls entirely within one sentence; if it spans more than one, omit the sentence id.`;
}

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

function buildClient(apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new NoApiKeyError();
  }
  return new Anthropic({ apiKey: key });
}

// Distinct from a "your key doesn't work" error from Anthropic itself — this
// one means no key was ever configured, which is actionable in a specific
// way (add one in Settings) rather than a generic failure message.
export class NoApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key configured. Add your own in Settings to use Provoke.');
    this.name = 'NoApiKeyError';
  }
}

// A cheap, no-token-cost call used to confirm a key actually works before
// saving it, so a typo doesn't silently break Provoke until the user tries it.
export async function validateApiKey(apiKey) {
  const client = new Anthropic({ apiKey });
  await client.models.retrieve(MODEL);
}

export async function generateProvocations(text, audienceKey, apiKey) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];

  const paragraphs = segmentText(text);
  const outline = renderSegmentedOutline(paragraphs);

  const client = buildClient(apiKey);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(audienceKey),
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
