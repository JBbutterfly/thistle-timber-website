import { DataSource } from './DataSource'
import { notifySyncQueueChanged } from './events'
import { getDb } from './idb'
import { mockRemote } from './mockRemote'
import { seedContentItems, seedUsers } from './mockSeed'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Local-first data source backed by IndexedDB, with a simulated remote
 * (see mockRemote.js) standing in for Firestore. Every read resolves from
 * the local cache first — the network is only ever consulted to refresh
 * that cache or flush the sync queue, both in the background.
 *
 * @implements {DataSource}
 */
export class MockDataSource extends DataSource {
  constructor() {
    super()
    this._seeded = this._seedIfEmpty()
  }

  async _seedIfEmpty() {
    const db = await getDb()
    const existing = await db.count('content_items')
    if (existing === 0) {
      const tx = db.transaction(['content_items', 'users'], 'readwrite')
      await Promise.all([
        ...seedContentItems.map((item) => tx.objectStore('content_items').put(item)),
        ...seedUsers.map((user) => tx.objectStore('users').put(user)),
      ])
      await tx.done
    }
  }

  async getContentItems(orgId) {
    await this._seeded
    const db = await getDb()
    return db.getAllFromIndex('content_items', 'by_org', orgId)
  }

  async getContentItem(id) {
    await this._seeded
    const db = await getDb()
    return db.get('content_items', id)
  }

  async getUser(userId) {
    await this._seeded
    const db = await getDb()
    return db.get('users', userId)
  }

  async refreshStaleContent(orgId) {
    await this._seeded
    let remoteItems
    try {
      remoteItems = await mockRemote.fetchContentItems(orgId)
    } catch {
      // Offline, or the backend is unreachable — the cache we already have
      // is still good. Refresh will happen next time we're asked and online.
      return
    }
    const db = await getDb()
    const tx = db.transaction('content_items', 'readwrite')
    const store = tx.objectStore('content_items')
    for (const remoteItem of remoteItems) {
      const local = await store.get(remoteItem.id)
      if (!local || new Date(remoteItem.last_updated) > new Date(local.last_updated)) {
        await store.put(remoteItem)
      }
    }
    await tx.done
  }

  async enqueueAction({ user_id, content_id, action_type }) {
    const db = await getDb()
    /** @type {import('./schema').SyncQueueItem} */
    const entry = {
      id: uuid(),
      user_id,
      content_id,
      action_type,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
    }
    await db.put('sync_queue', entry)
    notifySyncQueueChanged()
    // Fire-and-forget: try to flush right away in case we're online, but
    // the caller never waits on this — the write above already succeeded.
    this.flushSyncQueue()
    return entry
  }

  async getSyncQueue() {
    const db = await getDb()
    return db.getAll('sync_queue')
  }

  async flushSyncQueue() {
    const db = await getDb()
    const pending = await db.getAllFromIndex('sync_queue', 'by_status', 'pending')
    if (pending.length === 0) return
    try {
      await mockRemote.pushSyncActions(pending)
    } catch {
      return // still offline — leave everything pending, try again later
    }
    const tx = db.transaction('sync_queue', 'readwrite')
    for (const entry of pending) {
      await tx.objectStore('sync_queue').put({ ...entry, sync_status: 'synced' })
    }
    await tx.done
    notifySyncQueueChanged()
  }

  async markViewed(userId, contentId) {
    const db = await getDb()
    await db.put('viewed_items', { key: `${userId}:${contentId}`, viewed_at: new Date().toISOString() })
  }

  async isViewed(userId, contentId) {
    const db = await getDb()
    const record = await db.get('viewed_items', `${userId}:${contentId}`)
    return Boolean(record)
  }
}
