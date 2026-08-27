import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardDrive, FileText, Building2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from './api/superAdminApi';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function SuperStoragePage() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getOrganizations();
        const orgList = res.data || [];
        const enriched = await Promise.all(
          orgList.map(async (org) => {
            try {
              const storage = await api.getOrgStorage(org.id);
              return { ...org, storage: storage.storage };
            } catch {
              return { ...org, storage: null };
            }
          })
        );
        setOrgs(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading storage data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Storage Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Monitor storage usage across all organizations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((org) => {
          const s = org.storage;
          const usagePercent = s?.usage_percent || 0;
          const isWarning = usagePercent > 80;
          const isCritical = usagePercent > 95;

          return (
            <div
              key={org.id}
              onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
              className="rounded-xl p-5 shadow-sm cursor-pointer transition-all hover:shadow-md"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                  <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{org.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{org.slug}</p>
                </div>
              </div>

              {s ? (
                <>
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{formatBytes(s.total_bytes || 0)} / {s.max_storage_gb} {s.storage_unit || 'GB'}</span>
                      <span className="text-xs" style={{ color: isCritical ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--text-muted)' }}>{usagePercent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                      <div className="h-2 rounded-full" style={{
                        width: `${Math.min(usagePercent, 100)}%`,
                        background: isCritical ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-primary)',
                      }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{s.total_files} files</span>
                    <span>{formatBytes(s.remaining_bytes || 0)} left</span>
                  </div>
                </>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No storage data</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
