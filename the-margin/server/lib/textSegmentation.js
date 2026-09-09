// Splits raw manuscript text into paragraphs, and each paragraph into sentences,
// tracking character offsets into the original string. Used both to build the
// numbered-sentence prompt sent to Claude and (on the client) to re-locate a
// quoted phrase after the text has been edited.

function segmentSentences(paragraphText) {
  const sentences = [];
  const re = /[^.!?]*[.!?]+(?:["')\]]+)?(?:\s+|$)/g;
  let match;
  let lastEnd = 0;

  while ((match = re.exec(paragraphText))) {
    const raw = match[0];
    const start = match.index;
    const trimmedEnd = start + raw.replace(/\s+$/, '').length;
    const text = raw.trim();
    if (text) sentences.push({ start, end: trimmedEnd, text });
    lastEnd = start + raw.length;
  }

  if (lastEnd < paragraphText.length) {
    const rest = paragraphText.slice(lastEnd);
    if (rest.trim()) {
      const trimStart = lastEnd + (rest.length - rest.trimStart().length);
      sentences.push({ start: trimStart, end: paragraphText.length, text: rest.trim() });
    }
  }

  return sentences;
}

export function segmentText(text) {
  const paragraphs = [];
  const paraRegex = /[^\n]+(?:\n[^\n]+)*/g;
  let match;
  let paraIndex = 0;

  while ((match = paraRegex.exec(text))) {
    const paraText = match[0];
    const start = match.index;
    const end = start + paraText.length;
    const sentences = segmentSentences(paraText).map((s, i) => ({
      index: i,
      start: start + s.start,
      end: start + s.end,
      text: s.text,
    }));
    paragraphs.push({ index: paraIndex, start, end, text: paraText, sentences });
    paraIndex += 1;
  }

  return paragraphs;
}

// Renders the segmented draft as a numbered outline for the model prompt, e.g.
// "P1S1: The first sentence. P1S2: The second." — lets Claude cite a precise
// sentence id, which we still re-verify against the raw text before trusting it.
export function renderSegmentedOutline(paragraphs) {
  return paragraphs
    .map((p) =>
      p.sentences.map((s) => `[P${p.index}S${s.index}] ${s.text}`).join(' ')
    )
    .join('\n\n');
}
