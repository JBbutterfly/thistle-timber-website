import { openDB } from 'idb'

const DB_NAME = 'northridge-field-ops'
const DB_VERSION = 1

/** @type {Promise<import('idb').IDBPDatabase> | null} */
let dbPromise = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('content_items')) {
          const store = db.createObjectStore('content_items', { keyPath: 'id' })
          store.createIndex('by_org', 'org_id')
        }
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'user_id' })
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' })
          store.createIndex('by_status', 'sync_status')
        }
        if (!db.objectStoreNames.contains('viewed_items')) {
          // key is `${user_id}:${content_id}`
          db.createObjectStore('viewed_items', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}
