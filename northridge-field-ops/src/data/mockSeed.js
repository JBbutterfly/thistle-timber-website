// Seed content for the one test organization. In the real backend this
// lives in Firestore, scoped by org_id, and is fetched over the network.
export const ORG_ID = 'northridge-test-org'
export const CURRENT_USER_ID = 'u-jordan-reyes'

/** @type {import('./schema').AppUser[]} */
export const seedUsers = [
  {
    user_id: CURRENT_USER_ID,
    name: 'Jordan Reyes',
    role: 'crew_member',
    org_id: ORG_ID,
    assigned_items: ['c-fall-protection', 'c-trench-safety', 'c-vehicle-policy', 'c-onboard-1', 'c-onboard-2', 'c-onboard-3', 'c-heat-illness'],
  },
]

/** @type {import('./schema').ContentItem[]} */
export const seedContentItems = [
  {
    id: 'c-fall-protection',
    org_id: ORG_ID,
    title: 'Fall protection procedure',
    category: 'sop',
    body:
      'We require fall protection whenever a crew member works at a height of six feet or more above a lower level.\n\n' +
      'Before climbing, inspect your harness, lanyard, and anchor point for wear or damage. Do not use equipment that fails inspection — tag it out and report it to your supervisor.\n\n' +
      'Anchor points must hold at least 5,000 pounds per worker. Never anchor to guardrails, ductwork, or conduit.\n\n' +
      'If you see a crew member working at height without protection, stop the work and notify a supervisor immediately.',
    version: 3,
    last_updated: '2026-08-14T09:00:00.000Z',
    requires_ack: true,
  },
  {
    id: 'c-trench-safety',
    org_id: ORG_ID,
    title: 'Trench and excavation safety',
    category: 'sop',
    body:
      'Trenches five feet deep or greater require a protective system: shoring, shielding, or sloping, unless the trench is cut entirely through stable rock.\n\n' +
      'A competent person must inspect the trench daily, and after any rainfall or change in conditions, before crew members enter.\n\n' +
      'Keep spoil piles and equipment at least two feet back from the trench edge. Provide a ladder or ramp within twenty-five feet of every worker in a trench four feet or deeper.',
    version: 2,
    last_updated: '2026-07-02T09:00:00.000Z',
    requires_ack: true,
  },
  {
    id: 'c-heat-illness',
    org_id: ORG_ID,
    title: 'Heat illness prevention',
    category: 'policy',
    body:
      'We provide water, rest, and shade for every crew working outdoors in high heat.\n\n' +
      'Drink water every fifteen minutes, even before you feel thirsty. Take a cool-down rest in the shade if you feel dizzy, nauseous, or unusually fatigued.\n\n' +
      'Supervisors watch new crew members closely during their first two weeks, and during heat waves — the body needs time to acclimatize.',
    version: 1,
    last_updated: '2026-05-20T09:00:00.000Z',
    requires_ack: true,
  },
  {
    id: 'c-vehicle-policy',
    org_id: ORG_ID,
    title: 'Company vehicle policy',
    category: 'policy',
    body:
      'Company vehicles are for work use only. Seatbelts are required at all times, for every seat.\n\n' +
      'Report any accident, damage, or mechanical issue to your supervisor the same day. Do not operate a vehicle you have not been authorized to drive.\n\n' +
      'Keep the cab and bed free of debris and secure loose tools before moving.',
    version: 1,
    last_updated: '2026-03-11T09:00:00.000Z',
    requires_ack: false,
  },
  {
    id: 'c-onboard-1',
    org_id: ORG_ID,
    title: 'Meet your crew lead',
    category: 'onboarding_step',
    body:
      'Find your crew lead on-site before your first shift starts. They will walk you through the day’s job site, introduce you to the rest of the crew, and point out the nearest first aid kit and muster point.',
    version: 1,
    last_updated: '2026-01-05T09:00:00.000Z',
    requires_ack: true,
  },
  {
    id: 'c-onboard-2',
    org_id: ORG_ID,
    title: 'Collect your PPE',
    category: 'onboarding_step',
    body:
      'Visit the equipment trailer to collect your hard hat, safety glasses, gloves, and high-visibility vest. Confirm sizing with the equipment lead before your first shift on an active site.',
    version: 1,
    last_updated: '2026-01-05T09:00:00.000Z',
    requires_ack: true,
  },
  {
    id: 'c-onboard-3',
    org_id: ORG_ID,
    title: 'Complete your emergency contact form',
    category: 'onboarding_step',
    body:
      'We keep an emergency contact on file for every crew member. Fill out the paper form with your crew lead and return it before your second shift.',
    version: 1,
    last_updated: '2026-01-05T09:00:00.000Z',
    requires_ack: true,
  },
]
