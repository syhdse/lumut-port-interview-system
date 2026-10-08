
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '');

export default function AdminSignup() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (
      !name.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword ||
      !invitationCode.trim()
    ) {
      setError('Please complete all fields.');
      return;
    }

    if (password.length < 12) {
      setError('Password must contain at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/admin/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          invitation_code: invitationCode.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        let message = 'Registration failed. Please try again.';

        if (typeof result.detail === 'string') {
          message = result.detail;
        }

        throw new Error(message);
      }

      alert('Admin account created successfully! Please sign in.');
      router.push('/admin/login');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the server.'
      );
    } finally {
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

        {/* RIGHT SIDE */}

        <section className="admin-login-form-section">
          <div className="admin-login-box">

            <Link
              href="/admin/login"
              className="admin-back-link"
            >
              ← Back to Admin Login
            </Link>

            <div className="admin-login-heading">
              <span className="admin-login-small">
                ADMIN PORTAL
              </span>

              <h2>Create Admin Account</h2>

              <p>
                Register as an authorized administrator
                to access the interview evaluation system.
              </p>
            </div>

            <form
              className="admin-login-form"
              onSubmit={handleSubmit}
            >

              <label>
                Full Name
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>

              <label>
                Email Address
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password
                <div className="admin-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 12 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />

                  <button
                    type="button"
                    className="admin-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <label>
                Confirm Password
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label>
                Admin Invitation Code
                <input
                  type="password"
                  placeholder="Enter invitation code"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value)}
                  autoComplete="off"
                  required
                />
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
                {loading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </form>

            <div className="admin-login-note">
              <span></span>
              <p>
                Registration is restricted to authorized
                HR personnel and administrators only.
              </p>
            </div>

            <p style={{ textAlign: 'center', marginTop: '20px' }}>
              Already have an account?{' '}
              <Link href="/admin/login">
                Sign In
              </Link>
            </p>

          </div>
        </section>
      </div>
    </main>
  );
}
