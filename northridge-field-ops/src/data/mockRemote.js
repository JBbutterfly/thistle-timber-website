import { seedContentItems } from './mockSeed'

const NETWORK_DELAY_MS = 400

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Stands in for the future Firestore backend. Every method simulates
 * realistic network latency and fails outright when the browser reports
 * itself offline, the same way a real fetch to Firestore would.
 */
export const mockRemote = {
  /** @param {string} orgId @returns {Promise<import('./schema').ContentItem[]>} */
  async fetchContentItems(orgId) {
    if (!navigator.onLine) throw new Error('offline')
    await delay(NETWORK_DELAY_MS)
    return seedContentItems.filter((item) => item.org_id === orgId)
  },

  /**
   * Simulates POSTing queued sync actions to the backend.
   * @param {import('./schema').SyncQueueItem[]} _actions
   */
  async pushSyncActions(_actions) {
    if (!navigator.onLine) throw new Error('offline')
    await delay(NETWORK_DELAY_MS)
    return { ok: true }
  },
}
