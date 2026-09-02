import React from 'react';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="card-header">
        <div>
          <h1 className="card-title">Operational Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            System overview and library lending metrics
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: '600' }}>
          Welcome back, {user?.email}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
          This is the foundational dashboard view for library operations. The full metrics and aggregate charts will be connected in the dashboard implementation phase.
        </p>
      </div>
    </div>
  );
}
