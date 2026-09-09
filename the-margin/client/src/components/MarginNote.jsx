import { forwardRef, useEffect, useState } from 'react';

const MarginNote = forwardRef(function MarginNote({ note, top, onDismiss, onRespond }, ref) {
  const [expanded, setExpanded] = useState(Boolean(note.response));
  const [draftResponse, setDraftResponse] = useState(note.response || '');

  useEffect(() => {
    setDraftResponse(note.response || '');
  }, [note.id]);

  const matchType = note.anchor && note.anchor.matchType;
  const approximate = matchType && matchType !== 'exact';
  const approximateLabel =
    matchType === 'orphaned'
      ? '≈ passage since edited away — pinned to end of draft'
      : '≈ passage shifted — approximate position';

  function commitResponse() {
    if (draftResponse !== (note.response || '')) {
      onRespond(note.id, draftResponse);
    }
  }

  return (
    <div ref={ref} className="margin-note" style={{ top }} data-note-id={note.id}>
      <div className="margin-note-body" onClick={() => setExpanded((e) => !e)}>
        <span className="margin-note-mark">¶</span>
        {note.provocation}
      </div>

      {approximate && (
        <div className="margin-note-approx">{approximateLabel}</div>
      )}

      <div className="margin-note-controls">
        <button onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'collapse' : note.response ? 'view response' : 'reflect'}
        </button>
        <button onClick={() => onDismiss(note.id)}>dismiss</button>
      </div>

      {expanded && (
        <div className="margin-note-expanded">
          <div className="margin-note-quote">&ldquo;{note.quote}&rdquo;</div>
          <div className="margin-note-private-label">
            Private response — never sent to Claude
          </div>
          <textarea
            className="margin-note-response"
            placeholder="What do you actually think about this?"
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            onBlur={commitResponse}
          />
        </div>
      )}
    </div>
  );
});

export default MarginNote;
