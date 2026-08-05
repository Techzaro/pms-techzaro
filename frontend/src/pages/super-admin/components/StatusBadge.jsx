const statusStyles = {
  active: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  trial: { bg: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
  suspended: { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
  archived: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', border: 'var(--border-light)' },
  pending: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  healthy: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  warning: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  error: { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'rgba(220,38,38,0.3)' },
  info: { bg: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
  not_configured: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', border: 'var(--border-light)' },
  configured: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

const dotColor = {
  active: '#10b981', healthy: '#10b981', configured: '#10b981',
  suspended: '#dc2626', error: '#dc2626',
  trial: 'var(--color-primary)', info: 'var(--color-primary)',
  pending: '#f59e0b', warning: '#f59e0b',
};

export default function StatusBadge({ status, size = 'md', className = '' }) {
  const style = statusStyles[status] || statusStyles.pending;
  const sizeStyle = sizeStyles[size];

  return (
    <span className={`inline-flex items-center font-medium rounded-full capitalize ${sizeStyle} ${className}`}
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: dotColor[status] || 'var(--text-muted)' }} />
      {status}
    </span>
  );
}
