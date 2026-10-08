'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const API =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Evaluation = {
  evaluation_id: string;
  candidate_name: string;
  applied_position: string;
  date_of_interview: string;
  main_total: number;
  hse_total: number;
  grand_total: number;
  overall_evaluation: string;
  recommendation: string;
};

export default function UserDashboard() {
  const [rows, setRows] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function loadEvaluations() {
    setLoading(true);

    try {
      const sessionResponse = await fetch(`${API}/api/user/session`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!sessionResponse.ok) {
        throw new Error('Failed to initialize user session.');
      }

      const response = await fetch(`${API}/api/evaluations?mode=user`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load evaluations.');
      }

      const data = await response.json();

      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load evaluations:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvaluations();
  }, []);

  async function deleteEvaluation(id: string) {
    const confirmed = confirm(
      'Are you sure you want to delete this evaluation?'
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/evaluations/${encodeURIComponent(id)}?mode=user`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        alert('Unable to delete evaluation.');
        return;
      }

      setRows((current) =>
        current.filter(
          (item) => item.evaluation_id !== id
        )
      );
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Unable to delete evaluation.');
    }
  }

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        row.evaluation_id
          .toLowerCase()
          .includes(keyword) ||
        row.candidate_name
          .toLowerCase()
          .includes(keyword) ||
        row.applied_position
          .toLowerCase()
          .includes(keyword) ||
        row.overall_evaluation
          .toLowerCase()
          .includes(keyword) ||
        row.recommendation
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [rows, search]);

  const recentRows = rows.slice(0, 4);

  const recommended = rows.filter((row) => {
    const recommendation =
      row.recommendation.toLowerCase();

    return (
      recommendation.includes('recommend') &&
      !recommendation.includes('not recommend')
    );
  }).length;

  const averageScore =
    rows.length === 0
      ? 0
      : Math.round(
          rows.reduce(
            (total, row) =>
              total + row.grand_total,
            0
          ) / rows.length
        );

  return (
    <div className="user-dashboard">
      {/* =====================================================
          SIDEBAR
      ====================================================== */}

      <aside className="user-sidebar">
        <div className="user-sidebar-logo">
          <img
            src="/logo_bulk.png"
            alt="Lumut Port"
          />
        </div>

        <nav className="user-nav">
          <Link
            href="/"
            className="user-nav-item active"
          >
            <span className="nav-symbol">
              ⌂
            </span>

            <span>Dashboard</span>
          </Link>

          <Link
            href="/new"
            className="user-nav-item"
          >
            <span className="nav-symbol">
              ＋
            </span>

            <span>New Evaluation</span>
          </Link>

          <a
            href="#my-evaluations"
            className="user-nav-item"
          >
            <span className="nav-symbol">
              ▤
            </span>

            <span>My Evaluations</span>
          </a>
        </nav>

        <div className="user-sidebar-bottom">
          <div className="sidebar-system-name">
            Interview Evaluation System
          </div>
        </div>
      </aside>

      {/* =====================================================
          MAIN
      ====================================================== */}

      <main className="user-main">
        {/* =================================================
            TOP BAR
        ================================================== */}

        <header className="user-topbar">
          <div>
            <h1>Welcome</h1>

            <p>
              Manage your interview evaluations
            </p>
          </div>

          <Link
            href="/admin/login"
            className="user-new-btn"
          >
            Admin
          </Link>
        </header>

        {/* =================================================
            CONTENT
        ================================================== */}

        <div className="user-content">
          {/* ===============================================
              WELCOME
          ================================================ */}

          <section className="user-welcome">
            <div>
              <span className="welcome-small">
                LUMUT PORT
              </span>

              <h2>
                Interview Evaluation System
              </h2>

              <p>
                Create and manage your interview
                evaluation records easily.
              </p>
            </div>

            <Link
              href="/new"
              className="welcome-create"
            >
              <span>Create Evaluation</span>
              <span>→</span>
            </Link>
          </section>

          {/* ===============================================
              SUMMARY CARDS
          ================================================ */}

          <section className="user-summary">
            <div className="summary-card">
              <div className="summary-icon">
                ▤
              </div>

              <div className="summary-info">
                <span>
                  Total Evaluations
                </span>

                <strong>
                  {loading
                    ? '—'
                    : rows.length}
                </strong>

                <small>
                  Evaluation records
                </small>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon">
                ✓
              </div>

              <div className="summary-info">
                <span>
                  Recommended
                </span>

                <strong>
                  {loading
                    ? '—'
                    : recommended}
                </strong>

                <small>
                  Recommended candidates
                </small>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon">
                ★
              </div>

              <div className="summary-info">
                <span>
                  Average Score
                </span>

                <strong>
                  {loading
                    ? '—'
                    : `${averageScore}/60`}
                </strong>

                <small>
                  Average total score
                </small>
              </div>
            </div>
          </section>

          {/* ===============================================
              RECENT EVALUATIONS
          ================================================ */}

          <section className="user-section">
            <div className="user-section-title">
              <div>
                <h2>
                  Recent Evaluations
                </h2>

                <p>
                  Your latest interview
                  evaluations
                </p>
              </div>

              <a href="#my-evaluations">
                View all →
              </a>
            </div>

            {loading ? (
              <div className="user-empty">
                Loading evaluations...
              </div>
            ) : recentRows.length === 0 ? (
              <div className="user-empty">
                <div className="empty-plus">
                  ＋
                </div>

                <h3>
                  No evaluations yet
                </h3>

                <p>
                  Create your first interview
                  evaluation to get started.
                </p>

                <Link
                  href="/new"
                  className="user-new-btn"
                >
                  + New Evaluation
                </Link>
              </div>
            ) : (
              <div className="recent-grid">
                {recentRows.map((row) => (
                  <article
                    className="recent-card"
                    key={row.evaluation_id}
                  >
                    <div className="recent-top">
                      <span>
                        {row.evaluation_id}
                      </span>

                      <strong>
                        {row.grand_total}/60
                      </strong>
                    </div>

                    <div className="candidate-letter">
                      {row.candidate_name
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <h3>
                      {row.candidate_name}
                    </h3>

                    <p className="recent-position">
                      {row.applied_position}
                    </p>

                    <div className="recent-info">
                      <div>
                        <span>
                          Date
                        </span>

                        <strong>
                          {row.date_of_interview}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Recommendation
                        </span>

                        <strong>
                          {row.recommendation}
                        </strong>
                      </div>
                    </div>

                    <div className="recent-actions">
                      <Link
                        href={`/view/${row.evaluation_id}`}
                      >
                        View
                      </Link>

                      <Link
                        href={`/edit/${row.evaluation_id}`}
                      >
                        Edit
                      </Link>

                      <button
                        type="button"
                        onClick={() =>
                          deleteEvaluation(
                            row.evaluation_id
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ===============================================
              MY EVALUATIONS
          ================================================ */}

          <section
            className="user-section"
            id="my-evaluations"
          >
            <div className="user-section-title evaluations-title">
              <div>
                <h2>
                  My Evaluations
                </h2>

                <p>
                  View and manage your
                  evaluation records
                </p>
              </div>

              <div className="user-search">
                <span>⌕</span>

                <input
                  type="text"
                  placeholder="Search candidate, position or ID..."
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="user-table-wrapper">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>
                      Evaluation ID
                    </th>

                    <th>
                      Candidate
                    </th>

                    <th>
                      Position
                    </th>

                    <th>
                      Date
                    </th>

                    <th>
                      Score
                    </th>

                    <th>
                      Overall
                    </th>

                    <th>
                      Recommendation
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="user-table-empty"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="user-table-empty"
                      >
                        No evaluation records found.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={
                          row.evaluation_id
                        }
                      >
                        <td>
                          <strong>
                            {
                              row.evaluation_id
                            }
                          </strong>
                        </td>

                        <td>
                          <div className="user-candidate-cell">
                            <span className="mini-avatar">
                              {row.candidate_name
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <span>
                              {
                                row.candidate_name
                              }
                            </span>
                          </div>
                        </td>

                        <td>
                          {
                            row.applied_position
                          }
                        </td>

                        <td>
                          {
                            row.date_of_interview
                          }
                        </td>

                        <td>
                          <strong>
                            {
                              row.grand_total
                            }
                            /60
                          </strong>
                        </td>

                        <td>
                          {
                            row.overall_evaluation
                          }
                        </td>

                        <td>
                          <span className="user-recommendation">
                            {
                              row.recommendation
                            }
                          </span>
                        </td>

                        <td>
                          <div className="user-row-actions">
                            <Link
                              href={`/view/${row.evaluation_id}`}
                            >
                              View
                            </Link>

                            <Link
                              href={`/edit/${row.evaluation_id}`}
                            >
                              Edit
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                deleteEvaluation(
                                  row.evaluation_id
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}