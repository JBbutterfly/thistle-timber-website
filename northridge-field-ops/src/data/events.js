// Fired whenever the local sync queue changes — an action was recorded, or
// a background flush marked entries synced. Hooks subscribe to this so
// every screen showing queue-derived state (status badges, "recorded
// offline" panels) updates the moment it changes, not just on demand.
export const dataEvents = new EventTarget()
export const SYNC_QUEUE_CHANGED = 'sync_queue_changed'

export function notifySyncQueueChanged() {
  dataEvents.dispatchEvent(new Event(SYNC_QUEUE_CHANGED))
}
