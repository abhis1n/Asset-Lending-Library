import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';
import { getLoanDueDateLimits, validateLoanDueDate } from '../../utils/dateUtils';

export function CreateLoanModal({ isOpen, onClose, onSuccess }) {
  const { user, isLibrarian } = useAuth();

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [borrowerId, setBorrowerId] = useState('');
  const [initialStatus, setInitialStatus] = useState('ISSUED');
  const [dueDate, setDueDate] = useState('');
  const [borrowDurationDays, setBorrowDurationDays] = useState('14');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const limits = getLoanDueDateLimits();

  // Fetch active items and reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const data = await api.get('/items');
        // Filter only active items (backend already returns active by default)
        const activeItems = (data.items || []).filter((i) => !i.archived);
        setItems(activeItems);
        if (activeItems.length > 0) {
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
    setBorrowDurationDays('14');
    setErrors({});
    setApiError('');
    setNote('');
    setBorrowerId('');
  }, [isOpen]);

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

  if (!isOpen) return null;

  const validate = () => {
    const nextErrors = {};
    if (!selectedItemId) {
      nextErrors.itemId = 'Please select a catalogue item.';
    }

    if (isLibrarian) {
      if (!borrowerId || !borrowerId.trim()) {
        nextErrors.borrowerId = 'Borrower email or Member ID is required.';
      }

      if (initialStatus === 'ISSUED') {
        const validation = validateLoanDueDate(dueDate);
        if (!validation.isValid) {
          nextErrors.dueDate = validation.error;
        }
      }
    } else {
      const parsedDuration = Number(borrowDurationDays);
      if (borrowDurationDays === '' || isNaN(parsedDuration)) {
        nextErrors.borrowDurationDays = 'Borrowing period is required.';
      } else if (!Number.isInteger(parsedDuration)) {
        nextErrors.borrowDurationDays = 'Borrowing period must be a whole number of days.';
      } else if (parsedDuration < 1 || parsedDuration > 31) {
        nextErrors.borrowDurationDays = 'Borrowing period must be between 1 and 31 days.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleDueDateChange = (val) => {
    setDueDate(val);
    if (isLibrarian && initialStatus === 'ISSUED') {
      const validation = validateLoanDueDate(val);
      if (!validation.isValid) {
        setErrors((prev) => ({ ...prev, dueDate: validation.error }));
      } else {
        setErrors((prev) => {
          const { dueDate: _, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  const handleStatusChange = (val) => {
    setInitialStatus(val);
    if (val === 'ISSUED') {
      const validation = validateLoanDueDate(dueDate);
      if (!validation.isValid) {
        setErrors((prev) => ({ ...prev, dueDate: validation.error }));
      }
    } else {
      setErrors((prev) => {
        const { dueDate: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isLibrarian) {
        // Direct loan creation by librarian (accepts email or ID)
        const borrowerValue = borrowerId.trim();
        const payload = {
          itemId: parseInt(selectedItemId, 10),
          borrowerId: !isNaN(parseInt(borrowerValue, 10)) && !borrowerValue.includes('@')
            ? parseInt(borrowerValue, 10)
            : borrowerValue,
          status: initialStatus,
          dueDate: initialStatus === 'ISSUED' && dueDate ? new Date(dueDate).toISOString() : undefined,
          note: note.trim() || undefined,
        };
        const result = await api.post('/loans', payload);
        onSuccess(result.loan);
      } else {
        // Member requesting loan
        const payload = {
          itemId: parseInt(selectedItemId, 10),
          borrowDurationDays: parseInt(borrowDurationDays, 10),
          note: note.trim() || undefined,
        };
        const result = await api.post('/loans/request', payload);
        onSuccess(result.loan);
      }
      onClose();
    } catch (err) {
      const msg = err?.message || (typeof err === 'string' ? err : null);
      setApiError(msg || 'An unexpected error occurred while processing the loan.');
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
                {!isLibrarian && (
                  <div
                    data-testid="borrowing-limit-info"
                    style={{
                      backgroundColor: 'var(--primary-50, #eff6ff)',
                      border: '1px solid var(--primary-200, #bfdbfe)',
                      borderRadius: 'var(--radius-md, 6px)',
                      padding: '0.625rem 0.875rem',
                      marginBottom: '1rem',
                      fontSize: '0.8125rem',
                      color: 'var(--primary-800, #1e40af)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      lineHeight: '1.4',
                    }}
                  >
                    <span aria-hidden="true">ℹ️</span>
                    <span>
                      <strong>Borrowing limit:</strong> Members may have a maximum of <strong>2 active items</strong> (requested or issued combined) at any time.
                    </span>
                  </div>
                )}

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
                        Borrower (Member Email or ID) <span style={{ color: 'var(--danger-600)' }}>*</span>
                      </label>
                      <input
                        id="loan-borrowerId"
                        type="text"
                        className={`form-input ${errors.borrowerId ? 'is-invalid' : ''}`}
                        placeholder="e.g. alice.member@example.com or 2"
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
                          onChange={(e) => handleStatusChange(e.target.value)}
                          disabled={submitting}
                        >
                          <option value="ISSUED">ISSUED (Immediate Checkout)</option>
                          <option value="REQUESTED">REQUESTED (Pending Hold)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="loan-due-date">
                          Due Date {initialStatus === 'ISSUED' && <span style={{ color: 'var(--danger-600)' }}>*</span>}
                        </label>
                        <input
                          id="loan-due-date"
                          type="date"
                          className={`form-input ${errors.dueDate ? 'is-invalid' : ''}`}
                          value={dueDate}
                          min={limits.minDateString}
                          max={limits.maxDateString}
                          onChange={(e) => handleDueDateChange(e.target.value)}
                          disabled={submitting || initialStatus !== 'ISSUED'}
                          required={initialStatus === 'ISSUED'}
                        />
                        {errors.dueDate && (
                          <div className="form-feedback-error">{errors.dueDate}</div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Borrowing Period (Days) for Member Request */}
                {!isLibrarian && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="loan-duration">
                      Borrowing period (days) <span style={{ color: 'var(--danger-600)' }}>*</span>
                    </label>
                    <input
                      id="loan-duration"
                      type="number"
                      min="1"
                      max="31"
                      step="1"
                      className={`form-input ${errors.borrowDurationDays ? 'is-invalid' : ''}`}
                      placeholder="e.g. 7, 14, 21"
                      value={borrowDurationDays}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBorrowDurationDays(val);
                        const parsed = Number(val);
                        if (val === '' || isNaN(parsed)) {
                          setErrors((prev) => ({ ...prev, borrowDurationDays: 'Borrowing period is required.' }));
                        } else if (!Number.isInteger(parsed)) {
                          setErrors((prev) => ({ ...prev, borrowDurationDays: 'Borrowing period must be a whole number of days.' }));
                        } else if (parsed < 1 || parsed > 31) {
                          setErrors((prev) => ({ ...prev, borrowDurationDays: 'Borrowing period must be between 1 and 31 days.' }));
                        } else {
                          setErrors((prev) => {
                            const { borrowDurationDays: _, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      disabled={submitting}
                      required
                    />
                    {errors.borrowDurationDays && (
                      <div className="form-feedback-error">{errors.borrowDurationDays}</div>
                    )}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                      Choose between 1 and 31 days. Final due date will be calculated from the day equipment is issued.
                    </p>
                  </div>
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
