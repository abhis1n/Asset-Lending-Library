import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner, EmptyState, ErrorBanner, UnauthorizedState } from '../components/common/UIStates';
import { LoanDetailModal } from '../components/loans/LoanDetailModal';
import { ActionNoteModal } from '../components/loans/ActionNoteModal';

export function AlertsPage() {
  const { isLibrarian } = useAuth();

  const [overdueLoans, setOverdueLoans] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filters supported by GET /api/loans/overdue
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  // Modals state
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState('return'); // 'return' | 'lost'

  const fetchOverdueAlerts = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.append('search', search.trim());
      }
      if (category.trim()) {
        params.append('category', category.trim());
      }

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`/loans/overdue${queryString}`);
      setOverdueLoans(response.overdueLoans || []);
      setTotal(response.total ?? (response.overdueLoans?.length || 0));
    } catch (err) {
      setError(err.message || 'Failed to fetch overdue alerts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, category]);

  useEffect(() => {
    if (isLibrarian) {
      fetchOverdueAlerts();
    }
  }, [isLibrarian, fetchOverdueAlerts]);

  if (!isLibrarian) {
    return <UnauthorizedState message="Overdue equipment alerts are restricted to library staff only." />;
  }

  const handleMutationSuccess = async () => {
    await fetchOverdueAlerts();
  };

  const getDaysOverdue = (dueDateStr) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    const now = new Date();
    const diffMs = now.getTime() - due.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 1;
  };

  const hasActiveFilters = search || category;

  return (
    <div>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title" style={{ fontSize: '1.4rem' }}>
            🚨 Overdue Loan Alerts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Actionable monitoring for equipment loans past their scheduled return date
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchOverdueAlerts(true)}
            disabled={refreshing}
            aria-label="Refresh overdue alerts"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh Alerts'}
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
            onClick={() => fetchOverdueAlerts()}
            style={{ marginTop: '0.5rem' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Overdue Callout Alert Summary Banner */}
      {!loading && total > 0 && (
        <div className="alert-callout" style={{ marginBottom: '1.25rem' }} role="alert">
          <div className="alert-callout-content">
            <span style={{ fontSize: '2rem' }} aria-hidden="true">⚠️</span>
            <div>
              <div className="alert-callout-title" style={{ fontSize: '1.05rem' }}>
                {total} {total === 1 ? 'Loan is' : 'Loans are'} Currently Overdue
              </div>
              <div className="alert-callout-desc">
                Follow up with borrowers or process overdue check-ins to restore item availability.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="toolbar" style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
        <div className="filters-group" style={{ width: '100%' }}>
          <div className="search-wrapper" style={{ flex: '2', minWidth: '220px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search overdue item title, code, or borrower email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
              aria-label="Search overdue loans"
            />
          </div>

          <input
            type="text"
            className="form-input"
            placeholder="Filter category..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 'auto', minWidth: '150px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            aria-label="Filter by category"
          />

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setCategory('');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div style={{ padding: '4rem 0' }}>
          <LoadingSpinner message="Checking overdue loan alerts..." />
        </div>
      ) : overdueLoans.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No overdue loans match your filter' : 'No overdue loans!'}
          description={
            hasActiveFilters
              ? 'Try adjusting or clearing your search filter.'
              : 'All active equipment loans are currently on-time and within their due dates.'
          }
          actionText={hasActiveFilters ? 'Clear Filters' : null}
          onAction={() => {
            setSearch('');
            setCategory('');
          }}
          icon="✅"
        />
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Overdue loan alerts table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '80px' }}>ID</th>
                <th scope="col">Equipment Item</th>
                <th scope="col">Borrower</th>
                <th scope="col" style={{ width: '150px' }}>Due Date</th>
                <th scope="col" style={{ width: '140px' }}>Overdue Status</th>
                <th scope="col" style={{ textAlign: 'right', width: '200px' }}>Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {overdueLoans.map((loan) => {
                const daysOverdue = getDaysOverdue(loan.dueDate);

                return (
                  <tr key={loan.id}>
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
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--danger-600)' }}>
                        {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        Requested: {loan.requestedAt ? new Date(loan.requestedAt).toLocaleDateString() : '—'}
                      </div>
                    </td>
                    <td>
                      <span className="badge-overdue" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                        ⚠️ {daysOverdue ? `${daysOverdue}d overdue` : 'OVERDUE'}
                      </span>
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
                          title="View complete loan history"
                        >
                          Details
                        </button>

                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setSelectedLoan(loan);
                            setActionType('return');
                            setIsActionModalOpen(true);
                          }}
                          title="Process return for this overdue loan"
                        >
                          Return
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--danger-600)' }}
                          onClick={() => {
                            setSelectedLoan(loan);
                            setActionType('lost');
                            setIsActionModalOpen(true);
                          }}
                          title="Mark overdue equipment as lost"
                        >
                          Lost
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
