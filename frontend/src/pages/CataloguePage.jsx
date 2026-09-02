import React from 'react';
import { useAuth } from '../context/AuthContext';

export function CataloguePage() {
  const { isLibrarian } = useAuth();

  return (
    <div>
      <div className="card-header">
        <div>
          <h1 className="card-title">Catalogue Items</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isLibrarian
              ? 'Manage shared library assets, active status, and custodians'
              : 'Browse available library equipment and submit loan requests'}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: '600' }}>
          Catalogue Foundation Ready
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
          The item management interfaces (listing, search, creation, editing, custodians, and CSV import) will be fully implemented in the catalogue phase.
        </p>
      </div>
    </div>
  );
}
