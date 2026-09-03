import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ErrorBanner } from '../common/UIStates';
import { getLoanDueDateLimits, validateLoanDueDate } from '../../utils/dateUtils';

export function IssueLoanModal({ isOpen, onClose, loan, onSuccess }) {
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [errors, setErrors] = useState({});

  const duration = loan?.borrowDurationDays || 14;

  // Reset form and derive due date when modal opens
  useEffect(() => {
    if (!isOpen || !loan) return;

    // Derived due date: today + borrowDurationDays
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (loan.borrowDurationDays || 14));
    setDueDate(targetDate.toISOString().slice(0, 10)); // YYYY-MM-DD
    setNote('');
    setApiError('');
    setErrors({});
  }, [isOpen, loan]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !loan) return null;

  const validate = () => {
    const nextErrors = {};
    if (!dueDate) {
      nextErrors.dueDate = 'Due date is required.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

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

        <form onSubmit={handleSubmit} noValidate>
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
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Requested Borrowing Duration: <strong>{duration} day{duration === 1 ? '' : 's'}</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="issue-due-date">
                Due Date (Derived)
              </label>
              <input
                id="issue-due-date"
                type="date"
                className="form-input"
                value={dueDate}
                disabled
                readOnly
              />
              {errors.dueDate && (
                <div className="form-feedback-error">{errors.dueDate}</div>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                Derived from the member’s requested duration ({duration} day{duration === 1 ? '' : 's'}) starting from the actual issue date.
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
