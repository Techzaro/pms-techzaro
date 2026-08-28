import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) range.push(i);
    if (currentPage - delta > 2) range.unshift('...');
    if (currentPage + delta < totalPages - 1) range.push('...');
    range.unshift(1);
    if (totalPages > 1) range.push(totalPages);
    return range;
  };

  const btnStyle = { color: 'var(--text-muted)' };
  const hoverHandlers = {
    onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--bg-hover)'; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
  };

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-light)' }}>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('Page {{current}} of {{total}}', { current: currentPage, total: totalPages, defaultValue: `Page ${currentPage} of ${totalPages}` })}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1}
          className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors" style={btnStyle} {...hoverHandlers}>
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
          className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors" style={btnStyle} {...hoverHandlers}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getVisiblePages().map((page, i) =>
          page === '...' ? (
            <span key={`dots-${i}`} className="px-2" style={{ color: 'var(--text-muted)' }}>...</span>
          ) : (
            <button key={page} onClick={() => onPageChange(page)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                background: currentPage === page ? 'var(--color-primary)' : 'transparent',
                color: currentPage === page ? '#fff' : 'var(--text-secondary)',
              }}>
              {page}
            </button>
          )
        )}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors" style={btnStyle} {...hoverHandlers}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors" style={btnStyle} {...hoverHandlers}>
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
