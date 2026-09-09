// Locates a quoted phrase inside a (possibly since-edited) block of text.
// Tries an exact match first, then a whitespace/quote-normalized match, then
// falls back to the most similar sentence by word overlap. Returns null if
// nothing crosses the similarity threshold, so callers can treat the note as
// orphaned rather than pinning it somewhere misleading.

function normalizeWithMap(text) {
  let norm = '';
  const map = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i];
    if (ch === '‘' || ch === '’') ch = "'";
    if (ch === '“' || ch === '”') ch = '"';

    if (/\s/.test(ch)) {
      if (!lastWasSpace && norm.length > 0) {
        norm += ' ';
        map.push(i);
      }
      lastWasSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      lastWasSpace = false;
    }
  }

  return { norm: norm.trim(), map };
}

function wordSet(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// paragraphs: output of segmentText(text)
export function locateQuote(text, quote, paragraphs) {
  if (!quote || !quote.trim()) return null;

  const exactIdx = text.indexOf(quote);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + quote.length, matchType: 'exact' };
  }

  const { norm: normText, map } = normalizeWithMap(text);
  const { norm: normQuote } = normalizeWithMap(quote);
  if (normQuote) {
    const idx = normText.indexOf(normQuote);
    if (idx !== -1) {
      const start = map[idx];
      const end = map[idx + normQuote.length - 1] + 1;
      return { start, end, matchType: 'normalized' };
    }
  }

  const quoteWords = wordSet(quote);
  let best = null;
  for (const p of paragraphs) {
    for (const s of p.sentences) {
      const score = jaccard(quoteWords, wordSet(s.text));
      if (!best || score > best.score) {
        best = { score, start: s.start, end: s.end, paragraphIndex: p.index };
      }
    }
    if (!p.sentences.length) {
      const score = jaccard(quoteWords, wordSet(p.text));
      if (!best || score > best.score) {
        best = { score, start: p.start, end: p.end, paragraphIndex: p.index };
      }
    }
  }

  if (best && best.score >= 0.4) {
    return { start: best.start, end: best.end, matchType: 'fuzzy-sentence' };
  }

  if (paragraphs.length) {
    let bestPara = null;
    for (const p of paragraphs) {
      const score = jaccard(quoteWords, wordSet(p.text));
      if (!bestPara || score > bestPara.score) {
        bestPara = { score, start: p.start, end: p.end };
      }
    }
    if (bestPara && bestPara.score >= 0.2) {
      return { start: bestPara.start, end: bestPara.end, matchType: 'fuzzy-paragraph' };
    }
  }

  return null;
}
