import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link, useRouter } from '../../router/Router';

export function AppLayout({ children }) {
  const { user, isLibrarian, logout } = useAuth();
  const { navigate } = useRouter();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          📚 Lending<span>Library</span>
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard is librarian-only */}
          {isLibrarian && (
            <Link to="/dashboard" className="nav-link">
              <span>📊</span>
              <span>Dashboard</span>
            </Link>
          )}

          {/* Catalogue is available to all authenticated users */}
          <Link to="/catalogue" className="nav-link">
            <span>📦</span>
            <span>Catalogue</span>
          </Link>

          {/* Loans is available to all authenticated users */}
          <Link to="/loans" className="nav-link">
            <span>📋</span>
            <span>Loans</span>
          </Link>

          {/* Overdue alerts is librarian-only */}
          {isLibrarian && (
            <Link to="/alerts" className="nav-link">
              <span>⚠️</span>
              <span>Overdue Alerts</span>
            </Link>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="main-viewport">
        {/* Top Header */}
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Asset Lending System
            </span>
          </div>

          <div className="user-profile">
            <div className="user-info">
              <span className="user-email">{user?.email || 'User'}</span>
              <span className={`role-badge ${isLibrarian ? 'librarian' : 'member'}`}>
                {user?.role || 'User'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="btn btn-secondary btn-sm"
              title="Sign out of your session"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="content-body">{children}</main>
      </div>
    </div>
  );
}
