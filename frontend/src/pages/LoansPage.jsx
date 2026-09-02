import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner, EmptyState, ErrorBanner } from '../components/common/UIStates';
import { CreateLoanModal } from '../components/loans/CreateLoanModal';
import { IssueLoanModal } from '../components/loans/IssueLoanModal';
import { ActionNoteModal } from '../components/loans/ActionNoteModal';
import { LoanDetailModal } from '../components/loans/LoanDetailModal';
import { BulkReturnModal } from '../components/loans/BulkReturnModal';

export function LoansPage() {
  const { user, isLibrarian } = useAuth();

  const [loans, setLoans] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Server-Side Query Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [category, setCategory] = useState('');
  const [overdueFilter, setOverdueFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Multi-selection state for Librarian Bulk Return
  const [selectedLoanIds, setSelectedLoanIds] = useState([]);
  const [isBulkReturnModalOpen, setIsBulkReturnModalOpen] = useState(false);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);

  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState('return'); // 'return' | 'lost'

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    params.append('sortBy', sortBy);
    params.append('sortOrder', sortOrder);

    if (search.trim()) {
      params.append('search', search.trim());
    }
    if (status !== 'ALL') {
      params.append('status', status);
    }
    if (category.trim()) {
      params.append('category', category.trim());
    }
    if (overdueFilter === 'true') {
      params.append('overdue', 'true');
    } else if (overdueFilter === 'false') {
      params.append('overdue', 'false');
    }

    return params;
  }, [page, pageSize, sortBy, sortOrder, search, status, category, overdueFilter]);

  const fetchLoans = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const params = buildQueryParams();
      const response = await api.get(`/loans?${params.toString()}`);
      setLoans(response.loans || []);
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch loan records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  // Map of loans by ID for quick lookup in bulk actions
  const loansMap = useMemo(() => {
    const map = {};
    loans.forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [loans]);

  // Eligible loans on current page (ISSUED only)
  const eligibleIssuedLoans = useMemo(() => {
    return loans.filter((l) => l.status === 'ISSUED');
  }, [loans]);

  const allEligibleSelected =
    eligibleIssuedLoans.length > 0 &&
    eligibleIssuedLoans.every((l) => selectedLoanIds.includes(l.id));

  const handleToggleSelectAll = () => {
    if (allEligibleSelected) {
      // Unselect eligible on current page
      const eligibleIds = new Set(eligibleIssuedLoans.map((l) => l.id));
      setSelectedLoanIds((prev) => prev.filter((id) => !eligibleIds.has(id)));
    } else {
      // Select all eligible on current page
      const combined = new Set([...selectedLoanIds, ...eligibleIssuedLoans.map((l) => l.id)]);
      setSelectedLoanIds(Array.from(combined));
    }
  };

  const handleToggleSelectLoan = (loanId) => {
    setSelectedLoanIds((prev) =>
      prev.includes(loanId) ? prev.filter((id) => id !== loanId) : [...prev, loanId]
    );
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus('ALL');
    setCategory('');
    setOverdueFilter('ALL');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
    setSelectedLoanIds([]);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const params = buildQueryParams();
      // Remove pagination parameters for export to export all matching records
      params.delete('page');
      params.delete('pageSize');
      await api.download(`/loans/export?${params.toString()}`, 'loans-export.csv');
    } catch (err) {
      setError(err.message || 'Failed to export loans CSV.');
    } finally {
      setExporting(false);
    }
  };

  const handleMutationSuccess = async () => {
    setSelectedLoanIds([]);
    await fetchLoans();
  };

  const getStatusBadge = (statusValue, isOverdue) => {
    switch (statusValue) {
      case 'REQUESTED':
        return <span className="badge-requested">● Requested</span>;
      case 'ISSUED':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span className="badge-issued">● Issued</span>
            {isOverdue && <span className="badge-overdue">⚠️ OVERDUE</span>}
          </div>
        );
      case 'RETURNED':
        return <span className="badge-returned">● Returned</span>;
      case 'LOST':
        return <span className="badge-lost">● Lost</span>;
      default:
        return <span className="badge-archived">{statusValue}</span>;
    }
  };

  const startRecord = (pagination.page - 1) * pagination.pageSize + 1;
  const endRecord = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
  const hasActiveFilters = search || status !== 'ALL' || category || overdueFilter !== 'ALL';

  return (
    <div>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title" style={{ fontSize: '1.4rem' }}>
            {isLibrarian ? 'Loan Management' : 'My Equipment Loans'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isLibrarian
              ? 'Track, issue, and manage equipment loans across all library borrowers'
              : 'View your equipment loan requests, active checkouts, and due dates'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLoans(true)}
            disabled={refreshing}
            aria-label="Refresh loans"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh'}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={exporting}
            title="Export filtered loans to CSV file"
          >
            {exporting ? 'Exporting...' : '⬇️ Export CSV'}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            {isLibrarian ? '➕ Create Loan Directly' : '➕ Request Equipment Loan'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLoans()}
            style={{ marginTop: '0.5rem' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Floating / Embedded Selection Action Bar (Librarian Bulk Actions) */}
      {isLibrarian && selectedLoanIds.length > 0 && (
        <div className="selection-action-bar" role="region" aria-label="Bulk selection toolbar">
          <div className="selection-info">
            <span className="selection-count-pill">{selectedLoanIds.length}</span>
            <span>Loan(s) Selected</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsBulkReturnModalOpen(true)}
            >
              ↩️ Bulk Return ({selectedLoanIds.length})
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ color: '#ffffff', borderColor: '#475569' }}
              onClick={() => setSelectedLoanIds([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="toolbar" style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
        <div className="filters-group" style={{ width: '100%' }}>
          {/* Search Input */}
          <div className="search-wrapper" style={{ flex: '2', minWidth: '220px' }}>
            <input
              type="text"
              className="form-input"
              placeholder={isLibrarian ? "Search title, code, or borrower email..." : "Search equipment title or code..."}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
              aria-label="Search loans"
            />
          </div>

          {/* Status Filter */}
          <select
            className="form-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={{ width: 'auto', minWidth: '130px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Filter by loan status"
          >
            <option value="ALL">All Statuses</option>
            <option value="REQUESTED">Requested</option>
            <option value="ISSUED">Issued</option>
            <option value="RETURNED">Returned</option>
            <option value="LOST">Lost</option>
          </select>

          {/* Overdue Filter */}
          <select
            className="form-select"
            value={overdueFilter}
            onChange={(e) => {
              setOverdueFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: 'auto', minWidth: '140px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Filter by overdue status"
          >
            <option value="ALL">All Due Statuses</option>
            <option value="true">⚠️ Overdue Only</option>
            <option value="false">✅ On-Time / Returned</option>
          </select>

          {/* Category Filter */}
          <input
            type="text"
            className="form-input"
            placeholder="Filter category..."
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            style={{ width: 'auto', minWidth: '130px', maxWidth: '160px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Filter by category"
          />

          {/* Sort Control */}
          <select
            className="form-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [f, o] = e.target.value.split('-');
              setSortBy(f);
              setSortOrder(o);
              setPage(1);
            }}
            style={{ width: 'auto', minWidth: '160px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Sort loans"
          >
            <option value="createdAt-desc">Newest Created First</option>
            <option value="createdAt-asc">Oldest Created First</option>
            <option value="dueDate-asc">Due Date (Earliest First)</option>
            <option value="dueDate-desc">Due Date (Latest First)</option>
            <option value="requestedAt-desc">Requested Date (Latest First)</option>
            <option value="requestedAt-asc">Requested Date (Earliest First)</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetFilters}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Table or Empty State */}
      {loading ? (
        <div style={{ padding: '4rem 0' }}>
          <LoadingSpinner message="Loading loans from server..." />
        </div>
      ) : loans.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No matching loans found' : 'No loans on record'}
          description={
            hasActiveFilters
              ? 'Try resetting your search query or adjusting your filters.'
              : isLibrarian
              ? 'There are currently no active or historical loans in the library.'
              : 'You have not requested or borrowed any equipment yet.'
          }
          actionText={
            hasActiveFilters
              ? 'Clear Filters'
              : isLibrarian
              ? '➕ Create First Loan'
              : '➕ Request Equipment'
          }
          onAction={() => {
            if (hasActiveFilters) {
              handleResetFilters();
            } else {
              setIsCreateModalOpen(true);
            }
          }}
          icon="📋"
        />
      ) : (
        <>
          <div className="table-container">
            <table className="table" aria-label="Loans list table">
              <thead>
                <tr>
                  {isLibrarian && (
                    <th scope="col" className="checkbox-cell">
                      <input
                        type="checkbox"
                        className="checkbox-custom"
                        checked={allEligibleSelected}
                        onChange={handleToggleSelectAll}
                        disabled={eligibleIssuedLoans.length === 0}
                        title="Select all eligible issued loans on this page"
                        aria-label="Select all eligible issued loans on this page"
                      />
                    </th>
                  )}
                  <th scope="col" style={{ width: '80px' }}>ID</th>
                  <th scope="col">Equipment Item</th>
                  <th scope="col">Borrower</th>
                  <th scope="col" style={{ width: '130px' }}>Requested</th>
                  <th scope="col" style={{ width: '150px' }}>Due Date</th>
                  <th scope="col" style={{ width: '130px' }}>Status</th>
                  <th scope="col" style={{ textAlign: 'right', width: '170px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const isEligible = loan.status === 'ISSUED';
                  const isSelected = selectedLoanIds.includes(loan.id);

                  return (
                    <tr key={loan.id} style={{ backgroundColor: isSelected ? '#f1f5f9' : undefined }}>
                      {isLibrarian && (
                        <td className="checkbox-cell">
                          {isEligible ? (
                            <input
                              type="checkbox"
                              className="checkbox-custom"
                              checked={isSelected}
                              onChange={() => handleToggleSelectLoan(loan.id)}
                              aria-label={`Select loan #${loan.id} for bulk operations`}
                            />
                          ) : (
                            <span style={{ color: 'var(--border-strong)' }}>—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <span style={{ fontWeight: '700', color: 'var(--text-muted)' }}>#{loan.id}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                          {loan.item?.title || `Item #${loan.itemId}`}
                        </div>
                        <div style={{ marginTop: '0.2rem', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <span className="badge-code">{loan.item?.identifyingCode}</span>
                          <span className="badge-category">{loan.item?.category}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500' }}>
                          {loan.borrower?.email || `User #${loan.borrowerId}`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                          ID: {loan.borrowerId}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {loan.requestedAt ? new Date(loan.requestedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: loan.isOverdue ? '700' : 'normal', color: loan.isOverdue ? 'var(--danger-600)' : 'inherit' }}>
                          {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td>
                        {getStatusBadge(loan.status, loan.isOverdue)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedLoan(loan);
                              setIsDetailModalOpen(true);
                            }}
                            title="View loan details & audit history"
                          >
                            Details
                          </button>

                          {/* Librarian Quick Lifecycle Actions */}
                          {isLibrarian && (
                            <>
                              {loan.status === 'REQUESTED' && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => {
                                    setSelectedLoan(loan);
                                    setIsIssueModalOpen(true);
                                  }}
                                  title="Issue loan"
                                >
                                  Issue
                                </button>
                              )}

                              {loan.status === 'ISSUED' && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setSelectedLoan(loan);
                                    setActionType('return');
                                    setIsActionModalOpen(true);
                                  }}
                                  title="Process return"
                                >
                                  Return
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Bar */}
          <div className="pagination-container">
            <div className="pagination-info">
              Showing <strong>{startRecord}</strong> - <strong>{endRecord}</strong> of <strong>{pagination.totalItems}</strong> loans
            </div>

            <div className="pagination-controls">
              <label htmlFor="pageSize-select" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Per page:
              </label>
              <select
                id="pageSize-select"
                className="form-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.85rem', marginRight: '0.5rem' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>

              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                &larr; Prev
              </button>

              <span style={{ fontSize: '0.85rem', fontWeight: '600', padding: '0 0.5rem' }}>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>

              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                aria-label="Next page"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create / Request Loan Modal */}
      <CreateLoanModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleMutationSuccess}
      />

      {/* Bulk Return Modal (Librarian) */}
      <BulkReturnModal
        isOpen={isBulkReturnModalOpen}
        onClose={() => setIsBulkReturnModalOpen(false)}
        selectedLoanIds={selectedLoanIds}
        loansMap={loansMap}
        onSuccess={handleMutationSuccess}
      />

      {/* Issue Loan Modal (Librarian) */}
      <IssueLoanModal
        isOpen={isIssueModalOpen}
        onClose={() => {
          setIsIssueModalOpen(false);
          setSelectedLoan(null);
        }}
        loan={selectedLoan}
        onSuccess={handleMutationSuccess}
      />

      {/* Action Note Modal (Return / Lost) */}
      <ActionNoteModal
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false);
          setSelectedLoan(null);
        }}
        loan={selectedLoan}
        actionType={actionType}
        onSuccess={handleMutationSuccess}
      />

      {/* Loan Details & Audit History Modal */}
      <LoanDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedLoan(null);
        }}
        loan={selectedLoan}
        isLibrarian={isLibrarian}
        onOpenIssue={(loan) => {
          setSelectedLoan(loan);
          setIsIssueModalOpen(true);
        }}
        onOpenReturn={(loan) => {
          setSelectedLoan(loan);
          setActionType('return');
          setIsActionModalOpen(true);
        }}
        onOpenLost={(loan) => {
          setSelectedLoan(loan);
          setActionType('lost');
          setIsActionModalOpen(true);
        }}
      />
    </div>
  );
}
