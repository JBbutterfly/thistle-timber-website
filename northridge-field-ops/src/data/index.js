import { MockDataSource } from './MockDataSource'

// Swap this line for a FirestoreDataSource (implementing the same
// DataSource interface) when the real backend is wired up — nothing
// that imports `dataSource` needs to change.
export const dataSource = new MockDataSource()

export { ORG_ID, CURRENT_USER_ID } from './mockSeed'
