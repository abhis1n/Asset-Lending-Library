import React from 'react';
import { useAuth } from '../context/AuthContext';

export function LoansPage() {
  const { isLibrarian } = useAuth();

  return (
    <div>
      <div className="card-header">
        <div>
          <h1 className="card-title">Loan Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isLibrarian
              ? 'Oversee library loans, issue/return items, and review loan timelines'
              : 'View your requested and currently issued library loans'}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: '600' }}>
          Loan Operations Foundation Ready
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
          The loan querying, filters, lifecycle actions, bulk return, and CSV export interfaces will be fully implemented in the loan management phase.
        </p>
      </div>
    </div>
  );
}
