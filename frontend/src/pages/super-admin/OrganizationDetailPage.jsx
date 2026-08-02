import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Users, FolderKanban, Database, Globe, Calendar,
  Shield, HardDrive, Activity, ExternalLink, Loader2, Mail,
} from 'lucide-react';
import StatusBadge from './components/StatusBadge';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [emailPolicyLoading, setEmailPolicyLoading] = useState(false);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrganization(id);
      setOrg(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'suspend') await api.suspendOrganization(id);
      else if (action === 'activate') await api.activateOrganization(id);
      else if (action === 'delete') { if (confirm('Delete this organization?')) await api.deleteOrganization(id); navigate('/super-admin/organizations'); return; }
      await fetchOrg();
    } catch (e) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleEmailPolicyChange = async (newPolicy) => {
    setEmailPolicyLoading(true);
    try {
      await api.updateOrganization(id, { email_policy: newPolicy });
      setOrg((prev) => ({ ...prev, email_policy: newPolicy }));
    } catch (e) {
      alert(e.message);
    } finally {
      setEmailPolicyLoading(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchOrg} />;
  if (!org) return <ErrorState message="Organization not found" />;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'database', label: 'Database' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/super-admin/organizations')} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{org.name}</h1>
            <StatusBadge status={org.status} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{org.slug}.pms.test</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Globe, label: 'Domain', value: org.primary_domain?.domain || org.slug + '.pms.test' },
              { icon: Database, label: 'Database', value: org.database_name },
              { icon: Shield, label: 'Plan', value: org.subscription?.plan?.name || org.type },
              { icon: Users, label: 'Users', value: org.users_count || 0 },
              { icon: FolderKanban, label: 'Projects', value: org.projects_count || 0 },
              { icon: Calendar, label: 'Created', value: org.created_at?.split('T')[0] },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Email Policy</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Controls how user emails are managed in this organization.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleEmailPolicyChange('standard')}
                disabled={emailPolicyLoading || org.email_policy === 'standard'}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors border-2 text-left ${
                  org.email_policy === 'standard'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="font-semibold">Standard</span>
                </div>
                <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Single email for login and notifications</p>
              </button>
              <button
                onClick={() => handleEmailPolicyChange('company_required')}
                disabled={emailPolicyLoading || org.email_policy === 'company_required'}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors border-2 text-left ${
                  org.email_policy === 'company_required'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span className="font-semibold">Company Required</span>
                </div>
                <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Separate personal and company email</p>
              </button>
            </div>
            {emailPolicyLoading && (
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Updating...
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              {org.status === 'active' ? (
                <button onClick={() => handleAction('suspend')} disabled={actionLoading === 'suspend'}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {actionLoading === 'suspend' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Suspend
                </button>
              ) : (
                <button onClick={() => handleAction('activate')} disabled={actionLoading === 'activate'}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {actionLoading === 'activate' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Activate
                </button>
              )}
              <button onClick={() => handleAction('delete')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {org.users_count || 0} users in this organization. User management will be available via the tenant portal.
          </p>
        </div>
      )}

      {activeTab === 'database' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Database Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Database Name</p>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{org.database_name}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Host</p>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{org.database_host || '127.0.0.1'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
