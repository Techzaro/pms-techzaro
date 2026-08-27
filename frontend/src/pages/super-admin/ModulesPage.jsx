import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Puzzle, Search, Filter } from 'lucide-react';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

const categoryColors = {
  core: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
  standard: { bg: 'var(--color-primary-bg)', color: 'var(--color-primary)' },
  enterprise: { bg: 'rgba(147,51,234,0.1)', color: '#9333ea' },
};

const moduleNameOverrides = { deliverables: 'Subtask' };
function moduleDisplayName(name, slug) {
  return moduleNameOverrides[slug] || name;
}

export default function ModulesPage() {
  const { t } = useTranslation();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    api.getModules().then(res => setModules(res.data || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const filtered = modules.filter((mod) => {
    const matchSearch = moduleDisplayName(mod.name, mod.slug).toLowerCase().includes(search.toLowerCase()) || (mod.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || mod.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const s = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px' },
    text: { color: 'var(--text-dark)' },
    textSecondary: { color: 'var(--text-secondary)' },
    textMuted: { color: 'var(--text-muted)' },
    textHeading: { color: 'var(--text-heading)' },
    input: { background: 'var(--bg-hover)', color: 'var(--text-dark)', border: 'none' },
    divider: { borderTop: '1px solid var(--border-light)' },
    infoBox: { background: 'var(--color-primary-bg)', border: '1px solid var(--color-primary)' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={s.textHeading}>{t('Modules', { defaultValue: 'Modules' })}</h1>
        <p className="text-sm mt-1" style={s.textSecondary}>{t('{{count}} available modules', { count: modules.length, defaultValue: `${modules.length} available modules` })}</p>
      </div>

      <div className="rounded-xl" style={s.card}>
        <div className="p-4 flex flex-col sm:flex-row gap-3" style={s.divider}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={s.textMuted} />
            <input type="text" placeholder={t("Search modules...", { defaultValue: "Search modules..." })} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:ring-2 focus:ring-blue-500" style={s.input} />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={s.textMuted} />
            {['all', 'core', 'standard', 'enterprise'].map((cat) => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors"
                style={{
                  background: categoryFilter === cat ? 'var(--color-primary-bg)' : 'transparent',
                  color: categoryFilter === cat ? 'var(--color-primary)' : 'var(--text-muted)',
                }}>{t(cat, { defaultValue: cat })}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {filtered.map((mod) => {
            const catColor = categoryColors[mod.category] || categoryColors.standard;
            return (
              <div key={mod.id} className="p-4 rounded-xl hover:shadow-md transition-shadow"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={s.infoBox}>
                    <Puzzle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full capitalize"
                    style={{ background: catColor.bg, color: catColor.color }}>{t(mod.category, { defaultValue: mod.category })}</span>
                </div>
                <h3 className="text-sm font-semibold mb-1" style={s.textHeading}>{t(moduleDisplayName(mod.name, mod.slug), { defaultValue: moduleDisplayName(mod.name, mod.slug) })}</h3>
                <p className="text-xs mb-3 line-clamp-2" style={s.textSecondary}>{t(mod.description, { defaultValue: mod.description || 'No description' })}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={s.textMuted}>v{mod.version || '1.0'}</span>
                  <span className="w-2 h-2 rounded-full" style={{ background: mod.is_active ? '#10b981' : 'var(--text-muted)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
