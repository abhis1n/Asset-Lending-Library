import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Router, useRouter, Navigate } from './router/Router';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CataloguePage } from './pages/CataloguePage';
import { LoansPage } from './pages/LoansPage';
import { AlertsPage } from './pages/AlertsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingSpinner, UnauthorizedState } from './components/common/UIStates';

function AppRoutes() {
  const { user, isAuthenticated, isLibrarian, loading } = useAuth();
  const { path } = useRouter();

  // Show loading indicator during session initialization
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner message="Checking authentication status..." />
      </div>
    );
  }

  // Public Route: /login
  if (path === '/login') {
    if (isAuthenticated) {
      return <Navigate to={isLibrarian ? '/dashboard' : '/catalogue'} />;
    }
    return <LoginPage />;
  }

  // Protected Routes: Require authentication
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  // Helper to render role-protected views within AppLayout
  const renderContent = () => {
    switch (path) {
      case '/':
      case '/dashboard':
        if (!isLibrarian) {
          // If member lands on root or dashboard, redirect to catalogue or show unauthorized
          return path === '/' ? <Navigate to="/catalogue" /> : <UnauthorizedState />;
        }
        return <DashboardPage />;

      case '/catalogue':
        return <CataloguePage />;

      case '/loans':
        return <LoansPage />;

      case '/alerts':
        if (!isLibrarian) {
          return <UnauthorizedState message="Overdue alerts are only accessible by library staff." />;
        }
        return <AlertsPage />;

      default:
        return <NotFoundPage />;
    }
  };

  return <AppLayout>{renderContent()}</AppLayout>;
}

export function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
