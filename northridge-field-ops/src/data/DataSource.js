/**
 * Interface every data source must implement. Screens and hooks depend only
 * on this shape, never on how content is fetched or stored — swapping the
 * mock source for a real Firestore-backed one later is a drop-in change.
 *
 * @abstract
 */
export class DataSource {
  /**
   * Cached-first list of content items for an org. Resolves immediately from
   * local storage; never throws for being offline.
   * @param {string} _orgId
   * @returns {Promise<import('./schema').ContentItem[]>}
   */
  async getContentItems(_orgId) {
    throw new Error('not implemented')
  }

  /** @param {string} _id @returns {Promise<import('./schema').ContentItem | undefined>} */
  async getContentItem(_id) {
    throw new Error('not implemented')
  }

  /** @param {string} _userId @returns {Promise<import('./schema').AppUser | undefined>} */
  async getUser(_userId) {
    throw new Error('not implemented')
  }

  /**
   * Pull fresh content from the backend and refresh whatever is stale
   * (by last_updated) in local storage. Never interrupts the caller —
   * intended to run silently in the background on reconnect.
   * @param {string} _orgId
   */
  async refreshStaleContent(_orgId) {
    throw new Error('not implemented')
  }

  /**
   * Record a user action to the local sync queue immediately, online or
   * offline, with an on-device timestamp. Never waits on the network.
   * @param {{ user_id: string, content_id: string, action_type: import('./schema').SyncActionType }} _action
   * @returns {Promise<import('./schema').SyncQueueItem>}
   */
  async enqueueAction(_action) {
    throw new Error('not implemented')
  }

  /** @returns {Promise<import('./schema').SyncQueueItem[]>} */
  async getSyncQueue() {
    throw new Error('not implemented')
  }

  /**
   * Attempt to flush every pending sync_queue entry to the backend.
   * Safe to call repeatedly; already-synced entries are skipped.
   */
  async flushSyncQueue() {
    throw new Error('not implemented')
  }

  /** @param {string} _userId @param {string} _contentId */
  async markViewed(_userId, _contentId) {
    throw new Error('not implemented')
  }

  /** @param {string} _userId @param {string} _contentId @returns {Promise<boolean>} */
  async isViewed(_userId, _contentId) {
    throw new Error('not implemented')
  }
}
