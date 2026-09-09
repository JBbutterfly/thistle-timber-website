import { STATUS_LABEL, STATUS_COLOR_VAR } from '../data/status'

export function StatusBadge({ status }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4em',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: `var(${STATUS_COLOR_VAR[status]})`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: `var(${STATUS_COLOR_VAR[status]})`,
        }}
      />
      {STATUS_LABEL[status]}
    </span>
  )
}
