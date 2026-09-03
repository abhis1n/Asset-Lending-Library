import React, { useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';

import { computeItemAvailability } from '../../utils/availabilityUtils';

export { computeItemAvailability };

export function ItemDetailModal({
  isOpen,
  onClose,
  item,
  isLibrarian,
  onItemUpdated,
  onOpenEdit,
  onRequestArchive,
  onRequestRestore,
  onRequestRemoveCustodian,
}) {
  const { user } = useAuth();
  const [detailedItem, setDetailedItem] = useState(null);
  const [librarianIdInput, setLibrarianIdInput] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  const currentItem = detailedItem || item;

  // Refresh item details from backend when modal opens to ensure up-to-date loan availability
  React.useEffect(() => {
    if (!isOpen || !item?.id) {
      setDetailedItem(null);
      return;
    }
    setDetailedItem(item);

    let isMounted = true;
    api.get(`/items/${item.id}`)
      .then((res) => {
        if (isMounted && res?.item) {
          setDetailedItem(res.item);
        }
      })
      .catch((err) => {
        // Silently fall back to passed item prop
        console.error('Failed to refresh item details:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item?.id]);

  const availabilityInfo = computeItemAvailability(currentItem);
  const isAvailable = availabilityInfo.isAvailable;

  const isAssignedMyself =
    user && currentItem?.custodians?.some((c) => c.id === user.id);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !assigning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, assigning, onClose]);

  if (!isOpen || !currentItem) return null;

  const handleAssignCustodian = async (targetLibrarianId) => {
    if (!targetLibrarianId) return;
    setAssigning(true);
    setAssignError('');

    try {
      await api.post(`/items/${currentItem.id}/custodians/${targetLibrarianId}`);
      setLibrarianIdInput('');
      // Refresh item details
      const updated = await api.get(`/items/${currentItem.id}`);
      setDetailedItem(updated.item);
      onItemUpdated(updated.item);
    } catch (err) {
      setAssignError(err.message || 'Failed to assign custodian.');
    } finally {
      setAssigning(false);
    }
  };

  const handleCustomAssignSubmit = (e) => {
    e.preventDefault();
    const id = parseInt(librarianIdInput.trim(), 10);
    if (isNaN(id) || id < 1) {
      setAssignError('Please enter a valid librarian ID (positive integer).');
      return;
    }
    handleAssignCustodian(id);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="item-detail-modal-title">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="item-detail-modal-title" className="modal-title">{currentItem.title}</h2>
            <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge-code">{currentItem.identifyingCode}</span>
              <span className="badge-category">{currentItem.category}</span>
              <span className={currentItem.archived ? 'badge-archived' : 'badge-active'}>
                {currentItem.archived ? '● Archived' : '● Active'}
              </span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Metadata Card */}
          <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Created At</div>
                <div style={{ fontWeight: '600' }}>
                  {currentItem.createdAt ? new Date(currentItem.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Last Updated</div>
                <div style={{ fontWeight: '600' }}>
                  {currentItem.updatedAt ? new Date(currentItem.updatedAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Availability</div>
                <div
                  data-testid="item-availability"
                  style={{
                    fontWeight: '600',
                    color: isAvailable ? 'var(--success-600)' : 'var(--danger-600)',
                  }}
                >
                  {isAvailable ? 'Available' : 'Unavailable'}
                </div>
              </div>
            </div>
          </div>

          {/* Custodians Section */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              🛡️ Assigned Custodians
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Librarians responsible for maintaining and managing this equipment asset.
            </p>

            <ErrorBanner message={assignError} onDismiss={() => setAssignError('')} />

            {currentItem.custodians && currentItem.custodians.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {currentItem.custodians.map((custodian) => (
                  <div key={custodian.id} className="custodian-tag" style={{ padding: '0.35rem 0.65rem' }}>
                    <span>👤 {custodian.email}</span>
                    {isLibrarian && (
                      <button
                        type="button"
                        className="custodian-tag-remove"
                        onClick={() => onRequestRemoveCustodian(currentItem, custodian)}
                        title={`Remove ${custodian.email} as custodian`}
                        aria-label={`Remove ${custodian.email} as custodian`}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', fontStyle: 'italic', marginBottom: '1rem' }}>
                No librarians are currently assigned as custodians for this item.
              </p>
            )}

            {/* Librarian Custodian Assignment Controls */}
            {isLibrarian && (
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  Assign Custodian
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  {!isAssignedMyself && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleAssignCustodian(user.id)}
                      disabled={assigning}
                    >
                      {assigning ? 'Assigning...' : '✋ Assign Myself'}
                    </button>
                  )}

                  <form onSubmit={handleCustomAssignSubmit} style={{ display: 'flex', gap: '0.4rem', flex: 1, minWidth: '180px' }}>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Librarian User ID..."
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                      value={librarianIdInput}
                      onChange={(e) => setLibrarianIdInput(e.target.value)}
                      disabled={assigning}
                      min="1"
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={assigning || !librarianIdInput.trim()}
                    >
                      Assign
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {isLibrarian && (
              currentItem.archived ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRequestRestore(currentItem)}
                >
                  ♻️ Restore Item
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--danger-600)' }}
                  onClick={() => onRequestArchive(currentItem)}
                >
                  📦 Archive Item
                </button>
              )
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isLibrarian && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenEdit(currentItem);
                }}
              >
                ✏️ Edit Details
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
