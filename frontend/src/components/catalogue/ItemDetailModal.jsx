import React, { useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';

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
  const [librarianIdInput, setLibrarianIdInput] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  if (!isOpen || !item) return null;

  const isAssignedMyself =
    user && item.custodians?.some((c) => c.id === user.id);

  const handleAssignCustodian = async (targetLibrarianId) => {
    if (!targetLibrarianId) return;
    setAssigning(true);
    setAssignError('');

    try {
      await api.post(`/items/${item.id}/custodians/${targetLibrarianId}`);
      setLibrarianIdInput('');
      // Refresh item details
      const updated = await api.get(`/items/${item.id}`);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{item.title}</h2>
            <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge-code">{item.identifyingCode}</span>
              <span className="badge-category">{item.category}</span>
              <span className={item.archived ? 'badge-archived' : 'badge-active'}>
                {item.archived ? '● Archived' : '● Active'}
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
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Last Updated</div>
                <div style={{ fontWeight: '600' }}>
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Inventory Status</div>
                <div style={{ fontWeight: '600', color: item.archived ? 'var(--text-muted)' : 'var(--success-600)' }}>
                  {item.archived ? 'Archived (Hidden)' : 'Active (Available)'}
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

            {item.custodians && item.custodians.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {item.custodians.map((custodian) => (
                  <div key={custodian.id} className="custodian-tag" style={{ padding: '0.35rem 0.65rem' }}>
                    <span>👤 {custodian.email}</span>
                    {isLibrarian && (
                      <button
                        type="button"
                        className="custodian-tag-remove"
                        onClick={() => onRequestRemoveCustodian(item, custodian)}
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
              item.archived ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRequestRestore(item)}
                >
                  ♻️ Restore Item
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--danger-600)' }}
                  onClick={() => onRequestArchive(item)}
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
                  onOpenEdit(item);
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
