import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const colorMap = {
  blue: { bg: 'var(--color-primary-bg)', text: 'var(--color-primary)' },
  green: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
  purple: { bg: 'rgba(147,51,234,0.1)', text: '#9333ea' },
  amber: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  red: { bg: 'rgba(220,38,38,0.1)', text: '#dc2626' },
  cyan: { bg: 'rgba(6,182,212,0.1)', text: '#06b6d4' },
};

export default function StatCard({ title, value, icon: Icon, color = 'blue', change, changeLabel }) {
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="rounded-xl p-5 hover:shadow-md transition-shadow"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-heading)' }}>{value}</p>
        </div>
        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
          <Icon className="w-6 h-6" style={{ color: c.text }} />
        </div>
      </div>
      {change !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <TrendIcon className="w-4 h-4" style={{ color: change > 0 ? '#10b981' : change < 0 ? '#dc2626' : 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: change > 0 ? '#10b981' : change < 0 ? '#dc2626' : 'var(--text-secondary)' }}>
            {Math.abs(change)}%
          </span>
          {changeLabel && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
