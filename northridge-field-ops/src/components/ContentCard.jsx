import { Link } from 'react-router-dom'
import { CATEGORY_LABEL, STATUS_COLOR_VAR } from '../data/status'
import { StatusBadge } from './StatusBadge'

export function ContentCard({ item, status }) {
  return (
    <Link to={`/document/${item.id}`} className="card" style={{ display: 'block', padding: '1.1rem 1.2rem', textDecoration: 'none' }}>
      <span className="card__status-bar" style={{ background: `var(${STATUS_COLOR_VAR[status]})` }} />
      <span className="eyebrow">{CATEGORY_LABEL[item.category]}</span>
      <h3 style={{ fontSize: '1.05rem', margin: '0.35rem 0 0.6rem' }}>{item.title}</h3>
      <StatusBadge status={status} />
    </Link>
  )
}
