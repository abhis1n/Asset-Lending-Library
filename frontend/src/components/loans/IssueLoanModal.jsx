import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ErrorBanner } from '../common/UIStates';

export function IssueLoanModal({ isOpen, onClose, loan, onSuccess }) {
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    // Set default due date to 14 days in future
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setDueDate(defaultDate.toISOString().slice(0, 10)); // YYYY-MM-DD
    setNote('');
    setApiError('');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !loan) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSubmitting(true);

    try {
      const payload = {
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        note: note.trim() || undefined,
      };

      const result = await api.post(`/loans/${loan.id}/issue`, payload);
      onSuccess(result.loan);
      onClose();
    } catch (err) {
      setApiError(err.message || 'Failed to issue loan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="issue-loan-modal-title">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="issue-loan-modal-title" className="modal-title">Issue Equipment Loan #{loan.id}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

            {/* Loan Context Summary */}
            <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>
                {loan.item?.title} <span className="badge-code">[{loan.item?.identifyingCode}]</span>
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Borrower: <strong>{loan.borrower?.email || `User #${loan.borrowerId}`}</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="issue-due-date">
                Due Date
              </label>
              <input
                id="issue-due-date"
                type="date"
                className="form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                Optional. If specified, the system will track overdue compliance based on this date.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="issue-note">
                Issuance Note (Optional)
              </label>
              <input
                id="issue-note"
                type="text"
                className="form-input"
                placeholder="e.g. Checked out in good working condition with charger"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Issuing...' : 'Confirm & Issue Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
