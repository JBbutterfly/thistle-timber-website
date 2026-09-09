import { useEffect, useState } from 'react'
import { ContentCard } from '../components/ContentCard'
import { CURRENT_USER_ID, ORG_ID, dataSource } from '../data'
import { computeItemStatus } from '../data/status'
import { useContentItems } from '../hooks/useContentItems'
import { useSyncQueue } from '../hooks/useSyncQueue'

export function LibraryHome() {
  const { items } = useContentItems(ORG_ID)
  const { queue } = useSyncQueue()
  const [viewedIds, setViewedIds] = useState(new Set())

  useEffect(() => {
    if (!items) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        items.map(async (item) => [item.id, await dataSource.isViewed(CURRENT_USER_ID, item.id)]),
      )
      if (cancelled) return
      setViewedIds(new Set(entries.filter(([, viewed]) => viewed).map(([id]) => id)))
    })()
    return () => {
      cancelled = true
    }
  }, [items, queue])

  return (
    <div style={{ padding: '1.25rem 1.1rem 3rem', maxWidth: 640, margin: '0 auto' }}>
      <header style={{ margin: '0.5rem 0 1.5rem' }}>
        <span className="eyebrow">NorthRidge field ops</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '0.3rem' }}>Your library</h1>
        <p style={{ color: 'var(--bark)', marginTop: '0.4rem' }}>
          SOPs, policies, and onboarding steps assigned to you.
        </p>
      </header>

      {!items ? (
        <p style={{ color: 'var(--bark)' }}>Loading your library…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              status={computeItemStatus(item, queue, viewedIds.has(item.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
