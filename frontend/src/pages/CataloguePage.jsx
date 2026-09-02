import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner, EmptyState, ErrorBanner, ConfirmDialog } from '../components/common/UIStates';
import { ItemFormModal } from '../components/catalogue/ItemFormModal';
import { ItemDetailModal } from '../components/catalogue/ItemDetailModal';
import { CsvImportModal } from '../components/catalogue/CsvImportModal';

export function CataloguePage() {
  const { isLibrarian } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Tabs: 'active' | 'all' | 'custodial'
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    isDanger: false,
    onConfirm: null,
  });

  const fetchItems = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      let endpoint = '/items';
      if (isLibrarian) {
        if (activeTab === 'all') {
          endpoint = '/items?includeArchived=true';
        } else if (activeTab === 'custodial') {
          endpoint = '/me/custodial-items';
        }
      }

      const response = await api.get(endpoint);
      setItems(response.items || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch catalogue items.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isLibrarian, activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Distinct categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  // Client-side filtering across currently loaded items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesTitle = item.title?.toLowerCase().includes(term);
        const matchesCode = item.identifyingCode?.toLowerCase().includes(term);
        const matchesCat = item.category?.toLowerCase().includes(term);
        return matchesTitle || matchesCode || matchesCat;
      }

      return true;
    });
  }, [items, selectedCategory, searchTerm]);

  // Handlers for mutations
  const handleArchiveItem = (item) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Archive Catalogue Item',
      message: `Are you sure you want to archive "${item.title}" (${item.identifyingCode})? It will be hidden from the active catalogue.`,
      confirmText: 'Archive Item',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await api.post(`/items/${item.id}/archive`);
          await fetchItems();
          if (selectedItem?.id === item.id) {
            setIsDetailModalOpen(false);
          }
        } catch (err) {
          setError(err.message || 'Failed to archive item.');
        }
      },
    });
  };

  const handleRestoreItem = (item) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Restore Catalogue Item',
      message: `Restore "${item.title}" (${item.identifyingCode}) back to the active catalogue?`,
      confirmText: 'Restore Item',
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await api.post(`/items/${item.id}/restore`);
          await fetchItems();
          if (selectedItem?.id === item.id) {
            setIsDetailModalOpen(false);
          }
        } catch (err) {
          setError(err.message || 'Failed to restore item.');
        }
      },
    });
  };

  const handleRemoveCustodian = (item, custodian) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Custodian Assignment',
      message: `Remove ${custodian.email} as custodian for "${item.title}"?`,
      confirmText: 'Remove Custodian',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await api.delete(`/items/${item.id}/custodians/${custodian.id}`);
          const updated = await api.get(`/items/${item.id}`);
          setSelectedItem(updated.item);
          await fetchItems();
        } catch (err) {
          setError(err.message || 'Failed to remove custodian.');
        }
      },
    });
  };

  const handleItemUpdated = async (updatedItem) => {
    setSelectedItem(updatedItem);
    await fetchItems();
  };

  return (
    <div>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title" style={{ fontSize: '1.4rem' }}>
            Catalogue Items
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isLibrarian
              ? 'Manage shared library assets, equipment inventory, and assigned custodians'
              : 'Browse available library equipment and assets'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchItems(true)}
            disabled={refreshing}
            aria-label="Refresh catalogue items"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh'}
          </button>

          {isLibrarian && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsImportModalOpen(true)}
                title="Bulk import items from CSV"
              >
                📥 Import CSV
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setEditingItem(null);
                  setIsFormModalOpen(true);
                }}
              >
                ➕ Add New Item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchItems()}
            style={{ marginTop: '0.5rem' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Toolbar: Tabs (Librarian only), Search, Category Filter */}
      <div className="toolbar">
        {/* Librarian Tab Filter */}
        {isLibrarian && (
          <div className="tab-nav" role="tablist" aria-label="Catalogue view options">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
              role="tab"
              aria-selected={activeTab === 'active'}
            >
              Active Items
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
              role="tab"
              aria-selected={activeTab === 'all'}
            >
              All (Inc. Archived)
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'custodial' ? 'active' : ''}`}
              onClick={() => setActiveTab('custodial')}
              role="tab"
              aria-selected={activeTab === 'custodial'}
            >
              🛡️ My Custodial Items
            </button>
          </div>
        )}

        {/* Search & Category Filter Group */}
        <div className="filters-group">
          <div className="search-wrapper">
            <input
              type="text"
              className="form-input"
              placeholder="Search title, code, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
              aria-label="Search catalogue items"
            />
          </div>

          <select
            className="form-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: 'auto', minWidth: '160px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Filter by category"
          >
            <option value="ALL">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {(searchTerm || selectedCategory !== 'ALL') && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('ALL');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Loading, Empty State, or Items Table */}
      {loading ? (
        <div style={{ padding: '4rem 0' }}>
          <LoadingSpinner message="Loading catalogue items..." />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'No items in catalogue' : 'No matching items found'}
          description={
            items.length === 0
              ? isLibrarian
                ? 'Get started by creating your first equipment asset.'
                : 'There are currently no active items in the catalogue.'
              : 'Try adjusting your search terms or category filters.'
          }
          actionText={
            items.length === 0 && isLibrarian ? '➕ Add First Item' : searchTerm || selectedCategory !== 'ALL' ? 'Reset Filters' : null
          }
          onAction={() => {
            if (items.length === 0 && isLibrarian) {
              setEditingItem(null);
              setIsFormModalOpen(true);
            } else {
              setSearchTerm('');
              setSelectedCategory('ALL');
            }
          }}
          icon="📦"
        />
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Catalogue items table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '140px' }}>Code</th>
                <th scope="col">Title</th>
                <th scope="col" style={{ width: '160px' }}>Category</th>
                <th scope="col" style={{ width: '120px' }}>Status</th>
                <th scope="col">Custodians</th>
                <th scope="col" style={{ textAlign: 'right', width: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="badge-code">{item.identifyingCode}</span>
                  </td>
                  <td style={{ fontWeight: '600' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItem(item);
                        setIsDetailModalOpen(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-600)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: 'inherit',
                      }}
                      title="View item details"
                    >
                      {item.title}
                    </button>
                  </td>
                  <td>
                    <span className="badge-category">{item.category}</span>
                  </td>
                  <td>
                    <span className={item.archived ? 'badge-archived' : 'badge-active'}>
                      {item.archived ? '● Archived' : '● Active'}
                    </span>
                  </td>
                  <td>
                    {item.custodians && item.custodians.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {item.custodians.map((c) => (
                          <span key={c.id} className="custodian-tag">
                            👤 {c.email.split('@')[0]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>None assigned</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setIsDetailModalOpen(true);
                        }}
                        title="View details and custodians"
                      >
                        Details
                      </button>

                      {isLibrarian && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingItem(item);
                              setIsFormModalOpen(true);
                            }}
                            title="Edit item title, category, code"
                          >
                            Edit
                          </button>

                          {item.archived ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleRestoreItem(item)}
                              title="Restore item to active catalogue"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--danger-600)' }}
                              onClick={() => handleArchiveItem(item)}
                              title="Archive item"
                            >
                              Archive
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Item Form Modal (Create / Edit) */}
      <ItemFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          fetchItems();
        }}
        editItem={editingItem}
      />

      {/* CSV Import Modal (Librarian) */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          fetchItems();
        }}
      />

      {/* Item Detail / Manage Custodians Modal */}
      <ItemDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedItem(null);
        }}
        item={selectedItem}
        isLibrarian={isLibrarian}
        onItemUpdated={handleItemUpdated}
        onOpenEdit={(item) => {
          setEditingItem(item);
          setIsFormModalOpen(true);
        }}
        onRequestArchive={handleArchiveItem}
        onRequestRestore={handleRestoreItem}
        onRequestRemoveCustodian={handleRemoveCustodian}
      />

      {/* Destructive Action Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        isDanger={confirmDialog.isDanger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
