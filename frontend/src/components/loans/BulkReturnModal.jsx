import React, { useState } from 'react';
import { api } from '../../services/api';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';

export function BulkReturnModal({ isOpen, onClose, selectedLoanIds, loansMap, onSuccess }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedLoanIds || selectedLoanIds.length === 0) return;

    setSubmitting(true);
    setApiError('');

    try {
      const response = await api.post('/loans/bulk-return', {
        loanIds: selectedLoanIds,
        note: note.trim() || undefined,
      });
      setResult(response);
      onSuccess();
    } catch (err) {
      setApiError(err.message || 'Failed to execute bulk loan return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Bulk Return Equipment Loans</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

          {/* Result Breakdown View */}
          {result ? (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Bulk Return Summary
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {result.message}
                </p>
              </div>

              <div className="results-summary-grid">
                <div className="results-stat-box neutral">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.total || selectedLoanIds.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Submitted</div>
                </div>
                <div className="results-stat-box success">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.successful || 0}</div>
                  <div style={{ fontSize: '0.75rem' }}>Returned</div>
                </div>
                <div className="results-stat-box error">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.failed || 0}</div>
                  <div style={{ fontSize: '0.75rem' }}>Failed</div>
                </div>
              </div>

              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--danger-600)', marginBottom: '0.5rem' }}>
                    ⚠️ Failed Loan Details ({result.errors.length})
                  </h4>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)' }}>
                    <table className="error-details-table">
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Loan ID</th>
                          <th>Failure Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((err, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: '700' }}>#{err.loanId}</td>
                            <td>{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : submitting ? (
            <div style={{ padding: '3rem 0' }}>
              <LoadingSpinner message={`Processing return for ${selectedLoanIds.length} loans...`} />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                You are about to process the return for <strong>{selectedLoanIds.length}</strong> selected loan(s). Each loan will transition to <code>RETURNED</code> status and equipment assets will be marked available.
              </p>

              {/* Selected Loans List Preview */}
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.5rem', marginBottom: '1.25rem', backgroundColor: '#f8fafc' }}>
                {selectedLoanIds.map((id) => {
                  const loan = loansMap[id];
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', fontSize: '0.825rem', borderBottom: '1px solid var(--border-light)' }}>
                      <span>
                        <strong>#{id}</strong> {loan?.item?.title || `Item #${loan?.itemId}`} <span className="badge-code">{loan?.item?.identifyingCode}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Borrower: {loan?.borrower?.email || `User #${loan?.borrowerId}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="bulk-return-note">
                  Batch Return Condition Note (Optional)
                </label>
                <input
                  id="bulk-return-note"
                  type="text"
                  className="form-input"
                  placeholder="e.g. End of term lab equipment check-in batch"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="modal-footer" style={{ padding: '1rem 0 0', backgroundColor: 'transparent', borderTop: 'none' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  Confirm Bulk Return ({selectedLoanIds.length})
                </button>
              </div>
            </form>
          )}
        </div>

        {result && (
          <div className="modal-footer">
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              Done & Refresh List
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
