import React from 'react';

export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="spinner-wrapper">
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>{message}</p>
    </div>
  );
}

export function EmptyState({ title = 'No records found', description, actionText, onAction, icon = '📂' }) {
  return (
    <div className="empty-state">
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionText && onAction && (
        <button className="btn btn-primary" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            fontSize: '1.25rem',
            lineHeight: 1,
            padding: '0 0.25rem',
          }}
          aria-label="Dismiss error"
        >
          &times;
        </button>
      )}
    </div>
  );
}

export function UnauthorizedState({
  title = '403 — Access Restricted',
  message = 'You do not have permission to access this section. This view is restricted to library staff.',
}) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
      <h2 style={{ color: 'var(--danger-600)', marginBottom: '0.75rem', fontSize: '1.4rem' }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', maxWidth: '480px', margin: '0 auto 1.25rem' }}>
        {message}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
        Server-side role authorization enforces this policy. Contact a system administrator if you believe this is an error.
      </p>
    </div>
  );
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-dialog-title" style={{ marginBottom: '0.75rem', fontSize: '1.2rem', fontWeight: '700' }}>{title}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {message}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
