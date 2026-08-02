import { useState, useEffect } from 'react';
import { CreditCard, Check, X, Users, FolderKanban, HardDrive } from 'lucide-react';
import { LoadingState, ErrorState } from './components/LoadingState';
import { api } from './api/superAdminApi';

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPlans().then(res => setPlans(res.data || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const allModules = plans.flatMap(p => (p.modules || []).map(m => m.slug));
  const uniqueModules = [...new Set(allModules)].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plans & Pricing</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plans.length} subscription plans</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id}
            className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
              {plan.is_default && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">Default</span>
              )}
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">${plan.price_monthly}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">/month</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">${plan.price_yearly}/year</p>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Users className="w-4 h-4" /> {plan.max_users === 9999 ? 'Unlimited' : plan.max_users} users
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FolderKanban className="w-4 h-4" /> {plan.max_projects === 9999 ? 'Unlimited' : plan.max_projects} projects
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <HardDrive className="w-4 h-4" /> {plan.max_storage} GB storage
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Modules</p>
              <div className="space-y-2">
                {(plan.modules || []).map((mod) => (
                  <div key={mod.slug || mod.id} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{mod.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
