import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';

export function CreateLoanModal({ isOpen, onClose, onSuccess }) {
  const { user, isLibrarian } = useAuth();

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [borrowerId, setBorrowerId] = useState('');
  const [initialStatus, setInitialStatus] = useState('ISSUED');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch active items for selection
  useEffect(() => {
    if (!isOpen) return;

    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const data = await api.get('/items');
        // Filter only active items (backend already returns active by default)
        const activeItems = (data.items || []).filter((i) => !i.archived);
        setItems(activeItems);
        if (activeItems.length > 0 && !selectedItemId) {
          setSelectedItemId(String(activeItems[0].id));
        }
      } catch (err) {
        console.error('Failed to load items for loan creation:', err);
      } finally {
        setLoadingItems(false);
      }
    };

    loadItems();

    // Set default due date to 14 days in future for librarians
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setDueDate(defaultDate.toISOString().slice(0, 10)); // YYYY-MM-DD
    setErrors({});
    setApiError('');
    setNote('');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const validate = () => {
    const nextErrors = {};
    if (!selectedItemId) {
      nextErrors.itemId = 'Please select a catalogue item.';
    }

    if (isLibrarian) {
      if (!borrowerId || isNaN(parseInt(borrowerId, 10)) || parseInt(borrowerId, 10) < 1) {
        nextErrors.borrowerId = 'A valid numeric Borrower ID is required.';
      }
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
      if (isLibrarian) {
        // Direct loan creation by librarian
        const payload = {
          itemId: parseInt(selectedItemId, 10),
          borrowerId: parseInt(borrowerId.trim(), 10),
          status: initialStatus,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          note: note.trim() || undefined,
        };
        const result = await api.post('/loans', payload);
        onSuccess(result.loan);
      } else {
        // Member requesting loan
        const payload = {
          itemId: parseInt(selectedItemId, 10),
          note: note.trim() || undefined,
        };
        const result = await api.post('/loans/request', payload);
        onSuccess(result.loan);
      }
      onClose();
    } catch (err) {
      setApiError(err.message || 'Failed to submit loan request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="create-loan-modal-title">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="create-loan-modal-title" className="modal-title">
            {isLibrarian ? 'Create Loan Directly' : 'Request Equipment Loan'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

            {loadingItems ? (
              <LoadingSpinner message="Loading available catalogue items..." />
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)' }}>
                No active catalogue items are currently available.
              </div>
            ) : (
              <>
                {/* Item Selector */}
                <div className="form-group">
                  <label className="form-label" htmlFor="loan-item-select">
                    Select Equipment Asset <span style={{ color: 'var(--danger-600)' }}>*</span>
                  </label>
                  <select
                    id="loan-item-select"
                    className={`form-select ${errors.itemId ? 'is-invalid' : ''}`}
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    disabled={submitting}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        [{item.identifyingCode}] {item.title} ({item.category})
                      </option>
                    ))}
                  </select>
                  {errors.itemId && <div className="form-feedback-error">{errors.itemId}</div>}
                </div>

                {/* Librarian Direct Fields */}
                {isLibrarian && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="loan-borrowerId">
                        Borrower ID (Member) <span style={{ color: 'var(--danger-600)' }}>*</span>
                      </label>
                      <input
                        id="loan-borrowerId"
                        type="number"
                        min="1"
                        className={`form-input ${errors.borrowerId ? 'is-invalid' : ''}`}
                        placeholder="e.g. 2, 3 (Member User ID)"
                        value={borrowerId}
                        onChange={(e) => setBorrowerId(e.target.value)}
                        disabled={submitting}
                      />
                      {errors.borrowerId && (
                        <div className="form-feedback-error">{errors.borrowerId}</div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="loan-status-select">
                          Initial Status
                        </label>
                        <select
                          id="loan-status-select"
                          className="form-select"
                          value={initialStatus}
                          onChange={(e) => setInitialStatus(e.target.value)}
                          disabled={submitting}
                        >
                          <option value="ISSUED">ISSUED (Immediate Checkout)</option>
                          <option value="REQUESTED">REQUESTED (Pending Hold)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="loan-due-date">
                          Due Date (Optional)
                        </label>
                        <input
                          id="loan-due-date"
                          type="date"
                          className="form-input"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Optional Note */}
                <div className="form-group">
                  <label className="form-label" htmlFor="loan-note">
                    {isLibrarian ? 'Administrative Note (Optional)' : 'Borrowing Purpose / Note (Optional)'}
                  </label>
                  <input
                    id="loan-note"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Project workshop checkout, field research"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || items.length === 0}
            >
              {submitting
                ? 'Processing...'
                : isLibrarian
                ? 'Create Loan'
                : 'Submit Loan Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
