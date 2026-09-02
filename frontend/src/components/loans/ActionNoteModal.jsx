import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ErrorBanner } from '../common/UIStates';

export function ActionNoteModal({ isOpen, onClose, loan, actionType, onSuccess }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const isLost = actionType === 'lost';
  const isReturn = actionType === 'return';

  useEffect(() => {
    setNote('');
    setApiError('');
  }, [isOpen]);

  if (!isOpen || !loan) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSubmitting(true);

    try {
      const endpoint = isLost ? `/loans/${loan.id}/lost` : `/loans/${loan.id}/return`;
      const payload = {
        note: note.trim() || undefined,
      };

      const result = await api.post(endpoint, payload);
      onSuccess(result.loan);
      onClose();
    } catch (err) {
      setApiError(err.message || `Failed to ${isLost ? 'mark loan as lost' : 'process return'}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isLost ? 'Mark Loan as Lost' : 'Process Loan Return'} #{loan.id}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

            <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>
                {loan.item?.title} <span className="badge-code">[{loan.item?.identifyingCode}]</span>
              </div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Borrower: <strong>{loan.borrower?.email || `User #${loan.borrowerId}`}</strong>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: isLost ? 'var(--danger-600)' : 'var(--text-muted)', marginBottom: '1rem' }}>
              {isLost
                ? 'Warning: Marking this equipment as LOST records an immutable incident in the loan timeline history.'
                : 'Confirming this action will return the equipment asset to available inventory.'}
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="action-note">
                {isLost ? 'Incident / Loss Note' : 'Return Condition Note (Optional)'}
              </label>
              <textarea
                id="action-note"
                className="form-input"
                rows="3"
                placeholder={isLost ? 'e.g. Borrower reported bag stolen during field trip' : 'e.g. Returned on time in perfect condition'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={submitting}
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${isLost ? 'btn-danger' : 'btn-primary'}`}
              disabled={submitting}
            >
              {submitting ? 'Processing...' : isLost ? 'Confirm Marked Lost' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
