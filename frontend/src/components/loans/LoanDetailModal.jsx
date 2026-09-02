import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { LoadingSpinner, ErrorBanner } from '../common/UIStates';

export function LoanDetailModal({
  isOpen,
  onClose,
  loan,
  isLibrarian,
  onOpenIssue,
  onOpenReturn,
  onOpenLost,
}) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (!isOpen || !loan) return;

    const fetchHistory = async () => {
      setLoadingHistory(true);
      setHistoryError('');
      try {
        const data = await api.get(`/loans/${loan.id}/history`);
        setHistory(data.history || []);
      } catch (err) {
        setHistoryError(err.message || 'Failed to load loan timeline history.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loan, onClose]);

  if (!isOpen || !loan) return null;

  const getStatusBadge = (status, isOverdue) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="badge-requested">● Requested</span>;
      case 'ISSUED':
        return (
          <>
            <span className="badge-issued">● Issued</span>
            {isOverdue && <span className="badge-overdue">⚠️ OVERDUE</span>}
          </>
        );
      case 'RETURNED':
        return <span className="badge-returned">● Returned</span>;
      case 'LOST':
        return <span className="badge-lost">● Lost</span>;
      default:
        return <span className="badge-archived">{status}</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="loan-detail-modal-title">
      <div className="modal-container" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="loan-detail-modal-title" className="modal-title">Loan Details #{loan.id}</h2>
            <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {getStatusBadge(loan.status, loan.isOverdue)}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Item & Borrower Card */}
          <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', fontSize: '0.875rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Equipment Item</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>
                  {loan.item?.title || `Item #${loan.itemId}`}
                </div>
                <div style={{ marginTop: '0.2rem' }}>
                  <span className="badge-code">{loan.item?.identifyingCode}</span>{' '}
                  <span className="badge-category">{loan.item?.category}</span>
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Borrower</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>
                  {loan.borrower?.email || `User #${loan.borrowerId}`}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                  Role: {loan.borrower?.role || 'MEMBER'}
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Requested Date</div>
                <div style={{ fontWeight: '600' }}>
                  {loan.requestedAt ? new Date(loan.requestedAt).toLocaleString() : 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Due Date</div>
                <div style={{ fontWeight: '600', color: loan.isOverdue ? 'var(--danger-600)' : 'var(--text-main)' }}>
                  {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'No due date set'}
                </div>
              </div>
            </div>
          </div>

          {/* Immutable Timeline History (Strictly Read-Only) */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              📜 Immutable Loan History & Audit Trail
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Chronological log of state transitions and librarian notes. Entries cannot be modified or deleted.
            </p>

            <ErrorBanner message={historyError} onDismiss={() => setHistoryError('')} />

            {loadingHistory ? (
              <LoadingSpinner message="Loading timeline history..." />
            ) : history.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                No history records found for this loan.
              </p>
            ) : (
              <div className="timeline">
                {history.map((event) => (
                  <div key={event.id} className="timeline-item">
                    <div className={`timeline-dot ${event.type}`} aria-hidden="true"></div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-title">
                          Status updated to <strong>{event.type}</strong>
                        </span>
                        <span className="timeline-time">
                          {event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Actor: <strong>{event.actor?.email || 'System'}</strong> ({event.actor?.role || 'N/A'})
                      </div>
                      {event.note && (
                        <div className="timeline-note">
                          "{event.note}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {/* Librarian Lifecycle Action Buttons */}
          <div>
            {isLibrarian && (
              <>
                {loan.status === 'REQUESTED' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onClose();
                      onOpenIssue(loan);
                    }}
                  >
                    🏷️ Issue Loan
                  </button>
                )}

                {loan.status === 'ISSUED' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        onClose();
                        onOpenReturn(loan);
                      }}
                    >
                      ↩️ Process Return
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: 'var(--danger-600)' }}
                      onClick={() => {
                        onClose();
                        onOpenLost(loan);
                      }}
                    >
                      ⚠️ Mark Lost
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
