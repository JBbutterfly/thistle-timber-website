/**
 * @typedef {'sop' | 'policy' | 'onboarding_step'} ContentCategory
 *
 * @typedef {Object} ContentItem
 * @property {string} id
 * @property {string} org_id
 * @property {string} title
 * @property {ContentCategory} category
 * @property {string} body - plain text body, or a PDF reference (see pdf_url)
 * @property {string} [pdf_url] - present when the document is a PDF instead of inline text
 * @property {number} version
 * @property {string} last_updated - ISO timestamp
 * @property {boolean} requires_ack
 *
 * @typedef {'acknowledged' | 'checklist_item_complete'} SyncActionType
 *
 * @typedef {Object} SyncQueueItem
 * @property {string} id - client-generated UUID
 * @property {string} user_id
 * @property {string} content_id
 * @property {SyncActionType} action_type
 * @property {string} timestamp - ISO timestamp, captured on-device the instant the action happens
 * @property {'pending' | 'synced'} sync_status
 *
 * @typedef {'crew_member' | 'manager' | 'admin'} UserRole
 *
 * @typedef {Object} AppUser
 * @property {string} user_id
 * @property {string} name
 * @property {UserRole} role
 * @property {string} org_id
 * @property {string[]} assigned_items
 */

export {}
