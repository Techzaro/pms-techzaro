import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

export function LoadingState({ message }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message || t('Loading...', { defaultValue: 'Loading...' })}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'rgba(220,38,38,0.1)' }}>
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-sm text-red-600 mb-3">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          <RefreshCw className="w-4 h-4" /> {t('Retry', { defaultValue: 'Retry' })}
        </button>
      )}
    </div>
  );
}
