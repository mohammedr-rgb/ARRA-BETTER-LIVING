export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      animation: 'fadeInUp 0.3s ease'
    }}>
      <div style={{
        fontSize: 64,
        marginBottom: 16,
        filter: 'grayscale(0.3)',
        animation: 'pulse 2s infinite'
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 700,
        color: '#f1f5f9',
        marginBottom: 8
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: 14,
          color: '#94a3b8',
          maxWidth: 400,
          lineHeight: 1.6
        }}>
          {description}
        </div>
      )}
      {action && (
        <div style={{ marginTop: 24 }}>
          {action}
        </div>
      )}
    </div>
  )
}

export function LoadingSkeleton({ rows = 5, type = 'table' }) {
  if (type === 'card') {
    return (
      <div className="stat-card">
        <div className="skeleton" style={{ width: 40, height: 40, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: '80%', height: 28 }} />
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex',
          gap: 16,
          marginBottom: 16,
          alignItems: 'center'
        }}>
          <div className="skeleton" style={{ width: 80, height: 16 }} />
          <div className="skeleton" style={{ flex: 1, height: 16 }} />
          <div className="skeleton" style={{ width: 100, height: 16 }} />
          <div className="skeleton" style={{ width: 60, height: 16 }} />
        </div>
      ))}
    </div>
  )
}
