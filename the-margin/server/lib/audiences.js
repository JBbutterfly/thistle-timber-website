// The writer tells the app what kind of piece this is so the margin
// annotator can push on what actually matters for that context, instead of
// one generic critique style for everything. Kept as plain data (not logic)
// so the client can render the same options without duplicating judgment
// calls about what each audience means.

export const DEFAULT_AUDIENCE_KEY = 'general';

export const AUDIENCES = [
  {
    key: 'general',
    label: 'General / not sure yet',
    focus:
      "Read it as general prose with no fixed genre expectations. Look for whatever is actually coasting — an unexamined assumption, a gap in reasoning, an unconsidered counterargument, or a familiar idea standing in for the writer's own thinking.",
  },
  {
    key: 'academic',
    label: 'Academic paper / thesis',
    focus:
      "Read it like a rigorous peer reviewer. Push on whether claims are actually supported by evidence or method, whether a key term is doing unexamined theoretical work, whether an obvious competing framework or counter-study goes unaddressed, and whether the argument's structure would survive a hostile committee question.",
  },
  {
    key: 'business',
    label: 'Business memo / professional writing',
    focus:
      "Read it like a skeptical stakeholder deciding whether to act on this. Push on whether the actual decision or ask is clear, whether a real cost, risk, or tradeoff is being glossed over, and whether the argument would survive someone who doesn't already agree with the premise.",
  },
  {
    key: 'fiction',
    label: 'Fiction / creative writing',
    focus:
      "Read it like an editor who has seen this move before. Push on whether a character's motivation or reaction is earned by what's on the page rather than assumed, whether stakes are asserted rather than dramatized, and whether a beat is leaning on a familiar trope instead of the story's own logic.",
  },
  {
    key: 'journalism',
    label: 'Journalism / essay',
    focus:
      "Read it like a skeptical editor fact-checking the argument, not just the facts. Push on whether the framing is fair, whether an obvious opposing view or complicating detail is missing, and whether a claim is being asserted with more confidence than the evidence in the piece actually supports.",
  },
  {
    key: 'personal',
    label: 'Personal essay / blog',
    focus:
      "Read it like a close, honest friend. Push on whether a reflection is earned or a stock takeaway, whether the piece is performing vulnerability rather than risking something real, and whether a feeling is being asserted instead of shown.",
  },
];

export function getAudience(key) {
  return AUDIENCES.find((a) => a.key === key) || AUDIENCES.find((a) => a.key === DEFAULT_AUDIENCE_KEY);
}
