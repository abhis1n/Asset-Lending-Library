import React from 'react';
import { Link } from '../router/Router';

export function NotFoundPage() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔍</div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
        404 — Page Not Found
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        The requested page does not exist in the system.
      </p>
      <Link to="/" className="btn btn-primary">
        Return to Home
      </Link>
    </div>
  );
}
