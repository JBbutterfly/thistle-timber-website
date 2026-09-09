import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CATEGORY_LABEL } from '../data/status'
import { CURRENT_USER_ID, dataSource } from '../data'
import { useSyncQueue } from '../hooks/useSyncQueue'

const ACTION_COPY = {
  onboarding_step: { verb: 'Mark step complete', done: 'Step completed', action_type: 'checklist_item_complete' },
  sop: { verb: 'Acknowledge this procedure', done: 'Acknowledged', action_type: 'acknowledged' },
  policy: { verb: 'Acknowledge this policy', done: 'Acknowledged', action_type: 'acknowledged' },
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function DocumentDetail() {
  const { id } = useParams()
  const [item, setItem] = useState(null)
  const [user, setUser] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const { queue, reload: reloadQueue } = useSyncQueue()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [contentItem, appUser] = await Promise.all([
        dataSource.getContentItem(id),
        dataSource.getUser(CURRENT_USER_ID),
      ])
      if (cancelled) return
      setItem(contentItem)
      setUser(appUser)
      await dataSource.markViewed(CURRENT_USER_ID, id)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const handleAction = useCallback(
    async (actionType) => {
      setSubmitting(true)
      await dataSource.enqueueAction({ user_id: CURRENT_USER_ID, content_id: id, action_type: actionType })
      await reloadQueue()
      setSubmitting(false)
    },
    [id, reloadQueue],
  )

  if (!item) {
    return (
      <div style={{ padding: '1.25rem 1.1rem' }}>
        <BackLink />
        <p style={{ color: 'var(--bark)', marginTop: '1rem' }}>Loading document…</p>
      </div>
    )
  }

  const copy = ACTION_COPY[item.category]
  const ackEntry = queue.find((entry) => entry.content_id === item.id && entry.action_type === copy.action_type)

  return (
    <div style={{ padding: '1.25rem 1.1rem 3rem', maxWidth: 640, margin: '0 auto' }}>
      <BackLink />

      <article className="card" style={{ marginTop: '1rem', padding: '1.4rem 1.3rem' }}>
        <span className="eyebrow">{CATEGORY_LABEL[item.category]}</span>
        <h1 style={{ fontSize: '1.4rem', margin: '0.4rem 0 0.2rem' }}>{item.title}</h1>
        <p style={{ color: 'var(--bark)', fontSize: '0.82rem', marginBottom: '1.1rem' }}>
          Version {item.version} · updated {formatTimestamp(item.last_updated)}
        </p>

        {item.pdf_url ? (
          <a href={item.pdf_url} className="btn btn--secondary" style={{ marginBottom: '1.1rem' }}>
            Open PDF
          </a>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {item.body.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        )}
      </article>

      <div className="card" style={{ marginTop: '0.85rem', padding: '1.2rem 1.3rem' }}>
        {ackEntry ? (
          <CompletedPanel entry={ackEntry} userName={user?.name} label={copy.done} />
        ) : item.requires_ack ? (
          <button className="btn btn--primary" disabled={submitting} onClick={() => handleAction(copy.action_type)}>
            {submitting ? 'Saving…' : copy.verb}
          </button>
        ) : (
          <p style={{ color: 'var(--bark)' }}>This document is informational and doesn't require acknowledgment.</p>
        )}
      </div>
    </div>
  )
}

function CompletedPanel({ entry, userName, label }) {
  return (
    <div>
      <p style={{ color: 'var(--olive)', fontWeight: 600, marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ color: 'var(--bark)', fontSize: '0.9rem' }}>
        {userName ?? 'You'} on {formatTimestamp(entry.timestamp)}
      </p>
      <p style={{ color: 'var(--bark)', fontSize: '0.82rem', marginTop: '0.35rem' }}>
        {entry.sync_status === 'synced'
          ? 'Recorded and synced.'
          : "Recorded on this device offline. It will sync once you're back in range."}
      </p>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/" style={{ color: 'var(--bark)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
      ← Back to library
    </Link>
  )
}
