import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from '../router/Router';
import { LoadingSpinner, ErrorBanner } from '../components/common/UIStates';
import { WeeklyReturnsChart } from '../components/dashboard/WeeklyReturnsChart';

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardMetrics = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await api.get('/dashboard');
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to load operational dashboard metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardMetrics();
  }, [fetchDashboardMetrics]);

  if (loading) {
    return (
      <div style={{ padding: '4rem 0' }}>
        <LoadingSpinner message="Loading operational dashboard metrics..." />
      </div>
    );
  }

  const { catalogue, loans, overdue, weeklyReturns } = data || {
    catalogue: { total: 0, active: 0, archived: 0 },
    loans: { requested: 0, issued: 0, returned: 0, lost: 0, open: 0 },
    overdue: { total: 0, nonOverdueIssued: 0 },
    weeklyReturns: [],
  };

  const hasOverdue = overdue.total > 0;
  const activeRate = catalogue.total > 0
    ? Math.round((catalogue.active / catalogue.total) * 100)
    : 100;
  const onTimeRate = loans.issued > 0
    ? Math.round((overdue.nonOverdueIssued / loans.issued) * 100)
    : 100;

  return (
    <div>
      {/* Page Header */}
      <div className="card-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title" style={{ fontSize: '1.4rem' }}>
            Operational Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Real-time library asset inventory, loan activity, and operational compliance
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchDashboardMetrics(true)}
            disabled={refreshing}
            aria-label="Refresh operational metrics"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh Metrics'}
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
            onClick={() => fetchDashboardMetrics()}
            style={{ marginTop: '0.5rem' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Overdue Action Banner (Alert Callout) */}
      {hasOverdue && (
        <div className="alert-callout" role="alert" aria-live="polite">
          <div className="alert-callout-content">
            <span style={{ fontSize: '1.75rem' }} aria-hidden="true">⚠️</span>
            <div>
              <div className="alert-callout-title">
                {overdue.total} {overdue.total === 1 ? 'Loan is' : 'Loans are'} Currently Overdue
              </div>
              <div className="alert-callout-desc">
                Issued equipment past due date requiring review and borrower follow-up.
              </div>
            </div>
          </div>
          <Link to="/alerts" className="btn btn-danger btn-sm">
            View Overdue Alerts &rarr;
          </Link>
        </div>
      )}

      {/* Headline Overview Stats Grid */}
      <div className="dashboard-grid">
        {/* Total Catalogue Items */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Catalogue Assets</span>
            <span className="stat-icon" aria-hidden="true">📦</span>
          </div>
          <div className="stat-value">{catalogue.total}</div>
          <div className="stat-subtext">
            {catalogue.active} active · {catalogue.archived} archived
          </div>
        </div>

        {/* Total Open Loans */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Open Loans</span>
            <span className="stat-icon" aria-hidden="true">⏳</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--primary-600)' }}>
            {loans.open}
          </div>
          <div className="stat-subtext">
            {loans.requested} requested · {loans.issued} issued
          </div>
        </div>

        {/* Overdue Loans */}
        <div className={`stat-card alert-stat ${hasOverdue ? 'has-alerts' : ''}`}>
          <div className="stat-header">
            <span className="stat-label" style={{ color: hasOverdue ? 'var(--danger-600)' : 'var(--text-muted)' }}>
              Overdue Loans
            </span>
            <span className="stat-icon" aria-hidden="true">{hasOverdue ? '🚨' : '✅'}</span>
          </div>
          <div
            className="stat-value"
            style={{ color: hasOverdue ? 'var(--danger-600)' : 'var(--success-600)' }}
          >
            {overdue.total}
          </div>
          <div className="stat-subtext">
            {overdue.nonOverdueIssued} issued within due date
          </div>
        </div>

        {/* Completed Returns */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Completed Returns</span>
            <span className="stat-icon" aria-hidden="true">🔄</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--success-600)' }}>
            {loans.returned}
          </div>
          <div className="stat-subtext">
            {loans.lost} items marked lost
          </div>
        </div>
      </div>

      {/* 8-Week Item Return Chart */}
      <div style={{ marginBottom: '2rem' }}>
        <WeeklyReturnsChart weeklyReturns={weeklyReturns} />
      </div>

      {/* Detailed Operational Sections */}
      <div className="dashboard-sections-grid">
        {/* Section 1: Catalogue Overview */}
        <section className="card" aria-labelledby="catalogue-overview-heading">
          <div className="card-header">
            <h2 id="catalogue-overview-heading" className="card-title">
              📦 Catalogue Status
            </h2>
            <Link to="/catalogue" className="btn btn-secondary btn-sm">
              Manage Catalogue &rarr;
            </Link>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Equipment breakdown by operational availability.
          </p>

          <div className="breakdown-list">
            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--success-600)' }}>●</span> Active Available Items
              </span>
              <span className="breakdown-item-value">{catalogue.active}</span>
            </div>

            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--text-subtle)' }}>●</span> Soft-Archived Items
              </span>
              <span className="breakdown-item-value">{catalogue.archived}</span>
            </div>

            <div className="breakdown-item" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
              <span className="breakdown-item-label" style={{ fontWeight: '700' }}>
                Total Catalogue Holdings
              </span>
              <span className="breakdown-item-value" style={{ fontSize: '1rem' }}>
                {catalogue.total}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Active Inventory Rate</span>
              <span>{activeRate}%</span>
            </div>
            <div className="progress-bar-container" role="progressbar" aria-valuenow={activeRate} aria-valuemin="0" aria-valuemax="100">
              <div className="progress-bar-fill success" style={{ width: `${activeRate}%` }}></div>
            </div>
          </div>
        </section>

        {/* Section 2: Loan Lifecycle Distribution */}
        <section className="card" aria-labelledby="loan-distribution-heading">
          <div className="card-header">
            <h2 id="loan-distribution-heading" className="card-title">
              📋 Loan Status Distribution
            </h2>
            <Link to="/loans" className="btn btn-secondary btn-sm">
              Manage Loans &rarr;
            </Link>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Active requests, issued assets, and historical closure statuses.
          </p>

          <div className="breakdown-list">
            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: '#d97706' }}>●</span> Requested (Pending Issuance)
              </span>
              <span className="breakdown-item-value">{loans.requested}</span>
            </div>

            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--primary-600)' }}>●</span> Issued (Currently Out)
              </span>
              <span className="breakdown-item-value">{loans.issued}</span>
            </div>

            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--success-600)' }}>●</span> Returned (Completed)
              </span>
              <span className="breakdown-item-value">{loans.returned}</span>
            </div>

            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--danger-600)' }}>●</span> Lost (Unrecovered)
              </span>
              <span className="breakdown-item-value">{loans.lost}</span>
            </div>
          </div>

          <div className="breakdown-item" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
            <span className="breakdown-item-label" style={{ fontWeight: '700' }}>
              Total Open Loans (Requested + Issued)
            </span>
            <span className="breakdown-item-value" style={{ color: 'var(--primary-600)', fontSize: '1rem' }}>
              {loans.open}
            </span>
          </div>
        </section>

        {/* Section 3: Due Date Compliance */}
        <section className="card" aria-labelledby="due-compliance-heading">
          <div className="card-header">
            <h2 id="due-compliance-heading" className="card-title">
              ⏱️ Due Date Compliance
            </h2>
            <Link to="/alerts" className="btn btn-secondary btn-sm">
              Review Alerts &rarr;
            </Link>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Timeliness of active issued loans across the organization.
          </p>

          <div className="breakdown-list">
            <div className="breakdown-item">
              <span className="breakdown-item-label">
                <span style={{ color: 'var(--success-600)' }}>●</span> On-Time / Within Due Date
              </span>
              <span className="breakdown-item-value" style={{ color: 'var(--success-600)' }}>
                {overdue.nonOverdueIssued}
              </span>
            </div>

            <div className="breakdown-item" style={{ backgroundColor: hasOverdue ? '#fef2f2' : 'var(--bg-app)' }}>
              <span className="breakdown-item-label" style={{ color: hasOverdue ? 'var(--danger-600)' : 'var(--text-main)', fontWeight: hasOverdue ? '700' : '500' }}>
                <span style={{ color: 'var(--danger-600)' }}>●</span> Past Due Date (Overdue)
              </span>
              <span className="breakdown-item-value" style={{ color: hasOverdue ? 'var(--danger-600)' : 'var(--text-main)' }}>
                {overdue.total}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>On-Time Issued Compliance</span>
              <span>{onTimeRate}%</span>
            </div>
            <div className="progress-bar-container" role="progressbar" aria-valuenow={onTimeRate} aria-valuemin="0" aria-valuemax="100">
              <div
                className={`progress-bar-fill ${onTimeRate === 100 ? 'success' : onTimeRate >= 75 ? 'warning' : 'danger'}`}
                style={{ width: `${onTimeRate}%` }}
              ></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
