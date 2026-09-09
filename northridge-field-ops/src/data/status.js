/**
 * Derives a content item's display status from its own flags plus local,
 * on-device state — never from anything that requires a network round trip.
 *
 * @param {import('./schema').ContentItem} item
 * @param {import('./schema').SyncQueueItem[]} syncQueue
 * @param {boolean} viewed
 * @returns {'completed' | 'needs_acknowledgment' | 'in_progress' | 'new'}
 */
export function computeItemStatus(item, syncQueue, viewed) {
  const completingAction = item.category === 'onboarding_step' ? 'checklist_item_complete' : 'acknowledged'
  const completed = syncQueue.some((entry) => entry.content_id === item.id && entry.action_type === completingAction)

  if (completed) return 'completed'
  if (item.requires_ack) return 'needs_acknowledgment'
  if (viewed) return 'in_progress'
  return 'new'
}

export const STATUS_LABEL = {
  completed: 'Completed',
  needs_acknowledgment: 'Needs acknowledgment',
  in_progress: 'In progress',
  new: 'New',
}

export const STATUS_COLOR_VAR = {
  completed: '--olive',
  needs_acknowledgment: '--ember',
  in_progress: '--teal',
  new: '--goldenrod',
}

export const CATEGORY_LABEL = {
  sop: 'SOP',
  policy: 'Policy',
  onboarding_step: 'Onboarding',
}
