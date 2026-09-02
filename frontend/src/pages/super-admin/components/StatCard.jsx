import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const colorMap = {
  blue: { bg: 'var(--color-primary-bg)', text: 'var(--color-primary)' },
  green: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
  purple: { bg: 'rgba(147,51,234,0.1)', text: '#9333ea' },
  amber: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  red: { bg: 'rgba(220,38,38,0.1)', text: '#dc2626' },
  cyan: { bg: 'rgba(6,182,212,0.1)', text: '#06b6d4' },
};

export default function StatCard({ title, value, icon: Icon, color = 'blue', change, changeLabel, onClick }) {
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-xl p-3.5 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
      onClick={onClick}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-heading)' }}>{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
          <Icon className="w-4.5 h-4.5" style={{ color: c.text, width: 18, height: 18 }} />
        </div>
      </div>
      {change !== undefined && (
        <div className="mt-2 flex items-center gap-1.5">
          <TrendIcon className="w-3.5 h-3.5" style={{ color: change > 0 ? '#10b981' : change < 0 ? '#dc2626' : 'var(--text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: change > 0 ? '#10b981' : change < 0 ? '#dc2626' : 'var(--text-secondary)' }}>
            {Math.abs(change)}%
          </span>
          {changeLabel && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
