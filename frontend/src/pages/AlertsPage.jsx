import React from 'react';
import { useAuth } from '../context/AuthContext';

export function AlertsPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="card-header">
        <div>
          <h1 className="card-title">Overdue Loan Alerts</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Actionable alerts for loans that are currently past their due date
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: '600' }}>
          Alerts Foundation Ready
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
          This view connects to <code>GET /api/loans/overdue</code> and will display active overdue alerts with dismissal management in the alerts phase.
        </p>
      </div>
    </div>
  );
}
