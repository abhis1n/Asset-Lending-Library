import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { ErrorBanner } from '../components/common/UIStates';

export function LoginPage() {
  const { login, register } = useAuth();
  const { navigate } = useRouter();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleTabSwitch = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setErrors({});
    setApiError('');
    setPassword('');
    setConfirmPassword('');
  };

  const validate = () => {
    const nextErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      nextErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (mode === 'signup' && password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters long.';
    }

    if (mode === 'signup') {
      if (!confirmPassword) {
        nextErrors.confirmPassword = 'Please confirm your password.';
      } else if (password !== confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const user = await login(email.trim(), password);
        // Route based on role
        if (user.role === 'LIBRARIAN') {
          navigate('/dashboard');
        } else {
          navigate('/catalogue');
        }
      } else {
        // Sign up strictly as member
        await register(email.trim(), password);
        navigate('/catalogue');
      }
    } catch (err) {
      setApiError(err.message || (mode === 'signin' ? 'Invalid email or password.' : 'Failed to sign up.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">{mode === 'signin' ? 'Sign In' : 'Create Account'}</h1>
          <p className="login-subtitle">Asset Lending Library Management System</p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs" role="tablist" aria-label="Authentication Options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signin')}
            disabled={submitting}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signup')}
            disabled={submitting}
          >
            Sign Up (Member)
          </button>
        </div>

        <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className={`form-input ${errors.email ? 'is-invalid' : ''}`}
              placeholder={mode === 'signin' ? 'e.g. sarah.librarian@library.org' : 'e.g. new.member@example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              autoComplete="email"
            />
            {errors.email && <div className="form-feedback-error">{errors.email}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`form-input ${errors.password ? 'is-invalid' : ''}`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            {errors.password && <div className="form-feedback-error">{errors.password}</div>}
            {mode === 'signup' && !errors.password && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                Must be at least 6 characters long.
              </p>
            )}
          </div>

          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                className={`form-input ${errors.confirmPassword ? 'is-invalid' : ''}`}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <div className="form-feedback-error">{errors.confirmPassword}</div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
            disabled={submitting}
          >
            {submitting
              ? mode === 'signin'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Member Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {mode === 'signin' ? (
            <span>
              Need an account?{' '}
              <button
                type="button"
                onClick={() => handleTabSwitch('signup')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-600)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Sign Up as Member
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleTabSwitch('signin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-600)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Sign In
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

