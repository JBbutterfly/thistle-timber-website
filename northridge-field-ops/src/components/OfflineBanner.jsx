export function OfflineBanner({ isOnline }) {
  if (isOnline) return null
  return (
    <div
      style={{
        background: 'var(--bark)',
        color: 'var(--gold-light)',
        textAlign: 'center',
        fontSize: '0.82rem',
        fontWeight: 600,
        padding: '0.5rem 1rem',
      }}
    >
      You're offline. We'll save what you do here and sync it once you're back in range.
    </div>
  )
}
