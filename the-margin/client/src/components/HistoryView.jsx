import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HistoryView({ onOpenDraft }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getHistory()
      .then((data) => !cancelled && setEntries(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="content-scroll">
      <div className="history-view">
        <p className="history-intro">
          Every provocation you've expanded and actually written back to, across every draft, in
          the order you engaged with it. Dismissed challenges don't appear here — this is a record
          of what you argued with, not what Claude said.
        </p>

        {loading && <div className="draft-meta">Loading…</div>}
        {error && <div className="draft-meta">{error}</div>}
        {!loading && entries.length === 0 && (
          <div className="history-empty">
            No responses yet. Expand a provocation in a draft and write back to it — that's what
            shows up here.
          </div>
        )}

        {entries.map((entry) => (
            <div className="history-entry" key={entry.noteId}>
              <div className="history-date">
                {formatDateTime(entry.respondedAt)} ·{' '}
                <span className="history-draft-link" onClick={() => onOpenDraft(entry.draftId)}>
                  {entry.draftTitle || 'Untitled draft'}
                </span>
              </div>
              <div className="history-quote">&ldquo;{entry.quote}&rdquo;</div>
              <div className="history-provocation">{entry.provocation}</div>
              <div className="history-response-label">Your response</div>
              <div className="history-response">{entry.response}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
