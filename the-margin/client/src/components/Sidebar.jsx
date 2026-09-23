function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  drafts,
  currentDraftId,
  view,
  onSelectDraft,
  onNewDraft,
  onShowHistory,
  loadingDrafts,
  userEmail,
  onSignOut,
}) {
  return (
    <aside className="sidebar">
      <div>
        <h1 className="brand">The Margin</h1>
        <p className="brand-sub">a tool for thought</p>
      </div>

      <div className="sidebar-actions">
        <button className="btn primary" onClick={onNewDraft}>
          + New draft
        </button>
        <button
          className={`btn ${view === 'history' ? 'primary' : ''}`}
          onClick={onShowHistory}
        >
          History of provocations
        </button>
      </div>

      <div className="sidebar-section-label">Drafts</div>
      {loadingDrafts && <div className="draft-meta">Loading…</div>}
      {!loadingDrafts && drafts.length === 0 && (
        <div className="draft-meta">No drafts yet.</div>
      )}
      <ul className="draft-list">
        {drafts.map((d) => (
          <li
            key={d.id}
            className={`draft-list-item ${
              view === 'editor' && d.id === currentDraftId ? 'active' : ''
            }`}
            onClick={() => onSelectDraft(d.id)}
          >
            <div className="draft-title">{d.title || 'Untitled draft'}</div>
            <div className="draft-meta">
              {formatDate(d.updatedAt)}
              {d.noteCount ? ` · ${d.noteCount} note${d.noteCount === 1 ? '' : 's'}` : ''}
            </div>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <div className="draft-meta" title={userEmail} style={{ marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {userEmail}
        </div>
        <button className="btn subtle" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>
  );
}
