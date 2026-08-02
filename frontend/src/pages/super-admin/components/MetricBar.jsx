export default function MetricBar({ label, value, max, color = 'blue' }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  };

  const barColor = percent > 80 ? 'bg-red-500' : percent > 60 ? 'bg-amber-500' : colorMap[color] || 'bg-blue-500';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{percent.toFixed(0)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
