import { useCallback, useEffect, useState } from 'react'
import { dataSource } from '../data'
import { SYNC_QUEUE_CHANGED, dataEvents } from '../data/events'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * Tracks the local sync queue and flushes it to the backend automatically
 * the moment connectivity returns — the caller never has to ask. Also
 * reacts live to queue changes from anywhere (e.g. a background flush
 * finishing after this component already rendered a "pending" state).
 */
export function useSyncQueue() {
  const [queue, setQueue] = useState([])
  const isOnline = useOnlineStatus()

  const reload = useCallback(async () => {
    setQueue(await dataSource.getSyncQueue())
  }, [])

  useEffect(() => {
    reload()
    dataEvents.addEventListener(SYNC_QUEUE_CHANGED, reload)
    return () => dataEvents.removeEventListener(SYNC_QUEUE_CHANGED, reload)
  }, [reload])

  useEffect(() => {
    if (!isOnline) return
    ;(async () => {
      await dataSource.flushSyncQueue()
      await reload()
    })()
  }, [isOnline, reload])

  return { queue, reload, isOnline }
}
