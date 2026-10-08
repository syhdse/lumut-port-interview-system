
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '');

export default function AdminLogin() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result.detail === 'string'
            ? result.detail
            : 'Login failed. Please try again.'
        );
      }

      // Dashboard validates the session itself; avoid a second blocking request.
      router.replace('/admin/dashboard');
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Login timed out after 15 seconds. Check backend and database connection.'
          : err instanceof Error
            ? err.message
            : 'Unable to connect to the server.'
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-container">

        {/* LEFT SIDE */}

        <section className="admin-login-brand">
          <div className="admin-brand-content">
            <img
              src="/logo_bulk.png"
              alt="Lumut Port"
              className="admin-login-logo"
            />

            <div className="admin-brand-line" />

            <span className="admin-brand-label">
              INTERVIEW EVALUATION SYSTEM
            </span>

            <h1>
              Interview Management
              <br />
              Made Simple.
            </h1>

            <p>
              Securely manage interview evaluations,
              candidate records and administrative
              processes in one place.
            </p>
          </div>

          <div className="admin-brand-footer">
            Lumut Port
          </div>
        </section>

        <section className="admin-login-form-section">
          <div className="admin-login-box">

            <Link
              href="/"
              className="admin-back-link"
            >
              ← Back to User Dashboard
            </Link>

            <div className="admin-login-heading">
              <span className="admin-login-small">
                ADMIN PORTAL
              </span>

              <h2>Welcome back</h2>

              <p>
                Sign in to access the administration
                dashboard.
              </p>
            </div>

            <form
              className="admin-login-form"
              onSubmit={handleSubmit}
            >

              <label>
                Email Address

                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password

                <div className="admin-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    className="admin-password-toggle"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              {error && (
                <p
                  role="alert"
                  style={{
                    color: '#dc2626',
                    fontSize: '14px',
                    margin: '4px 0',
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="admin-login-button"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p
              style={{
                textAlign: 'center',
                marginTop: '20px',
              }}
            >
              Don't have an admin account?{' '}
              <Link href="/admin/signup">
                Sign Up
              </Link>
            </p>

            <div className="admin-login-note">
              <span></span>

              <p>
                This portal is restricted to
                authorized administrators only.
              </p>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}
