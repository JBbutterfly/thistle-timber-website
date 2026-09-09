import { useCallback, useEffect, useState } from 'react'
import { dataSource } from '../data'

/**
 * Cached-first list of content items. Resolves from local storage
 * immediately, then silently refreshes stale items in the background
 * whenever the caller is online — the list re-renders when that finishes,
 * but nothing blocks or interrupts on it.
 */
export function useContentItems(orgId) {
  const [items, setItems] = useState(null)

  const load = useCallback(async () => {
    const cached = await dataSource.getContentItems(orgId)
    setItems(cached)
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await load()
      if (cancelled) return
      await dataSource.refreshStaleContent(orgId)
      if (cancelled) return
      await load()
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, load])

  return { items, reload: load }
}
