'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

export default function AdminDashboard() {
  const router = useRouter();

  const [admin, setAdmin] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);

  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rows, setRows] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [excelBusy, setExcelBusy] = useState<'import' | 'export' | null>(null);
  const [excelMessage, setExcelMessage] = useState('');

  const [search, setSearch] = useState('');
  const [recommendationFilter, setRecommendationFilter] =
    useState('All');

  async function loadEvaluations() {
    setLoading(true);

    try {
      const response = await fetch(
        `${API}/api/evaluations?mode=admin`,
        {
          cache: 'no-store',
          credentials: 'include',
        }
      );

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
  let cancelled = false;

  async function checkAdminSession() {
    try {
      const response = await fetch(`${API}/api/admin/me`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Admin session is invalid.');
      }

      const data = await response.json();

      if (cancelled) return;

      setAdmin(data);
      // Dashboard renders immediately after session verification.
      // Evaluation records load separately without blocking login.
      void loadEvaluations();
    } catch (error) {
      console.error('Admin session error:', error);

      if (!cancelled) {
        router.replace('/admin/login');
      }
    } finally {
      if (!cancelled) {
        setCheckingSession(false);
      }
    }
  }

  checkAdminSession();

  return () => {
    cancelled = true;
  };
}, [router]);

  async function deleteEvaluation(id: string) {
    const confirmed = confirm(
      `Are you sure you want to delete evaluation ${id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/evaluations/${encodeURIComponent(id)}?mode=admin`,
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

  async function handleLogout() {
  if (loggingOut) return;

  setLoggingOut(true);

  try {
    const response = await fetch(`${API}/api/admin/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Logout failed.');
    }

    setAdmin(null);
    router.replace('/admin/login');
    router.refresh();
  } catch (error) {
    console.error('Logout error:', error);
    alert('Unable to log out. Please try again.');
  } finally {
    setLoggingOut(false);
  }
}

  async function getApiError(response: Response): Promise<string> {
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') return body.detail;
      if (typeof body.message === 'string') return body.message;
    } catch { /* The server may return a non-JSON error. */ }
    return `Request failed (${response.status}).`;
  }

  async function handleExport() {
    if (excelBusy) return;
    setExcelBusy('export');
    setExcelMessage('');
    try {
      const response = await fetch(`${API}/api/admin/evaluations/export`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lumut_interview_evaluations_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExcelMessage('Excel export downloaded successfully.');
    } catch (error) {
      setExcelMessage(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExcelBusy(null);
    }
  }

  function handleImport() {
    if (excelBusy) return;
    importInputRef.current?.click();
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || excelBusy) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setExcelMessage('Please choose an .xlsx Excel file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setExcelMessage('Excel file must not exceed 5 MB.');
      return;
    }
    if (!window.confirm(`Import evaluations from "${file.name}"? Existing Evaluation IDs will be skipped.`)) return;

    setExcelBusy('import');
    setExcelMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API}/api/admin/evaluations/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const result: { imported?: number; skipped?: number; errors?: string[] } = await response.json();
      const errors = Array.isArray(result.errors) ? result.errors : [];
      setExcelMessage(
        `Import complete: ${result.imported ?? 0} imported, ${result.skipped ?? 0} skipped.` +
        (errors.length ? ` Issues: ${errors.slice(0, 3).join(' | ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}` : '')
      );
      await loadEvaluations();
    } catch (error) {
      setExcelMessage(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExcelBusy(null);
    }
  }

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !keyword ||
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
          .includes(keyword);

      let matchesRecommendation = true;

      if (recommendationFilter === 'Recommended') {
        const value =
          row.recommendation.toLowerCase();

        matchesRecommendation =
          value.includes('recommend') &&
          !value.includes('not recommend');
      }

      if (recommendationFilter === 'Not Recommended') {
        matchesRecommendation =
          row.recommendation
            .toLowerCase()
            .includes('not recommend');
      }

      return (
        matchesSearch &&
        matchesRecommendation
      );
    });
  }, [
    rows,
    search,
    recommendationFilter,
  ]);

  const recommendedCount = rows.filter((row) => {
    const value =
      row.recommendation.toLowerCase();

    return (
      value.includes('recommend') &&
      !value.includes('not recommend')
    );
  }).length;

  const notRecommendedCount = rows.filter((row) =>
    row.recommendation
      .toLowerCase()
      .includes('not recommend')
  ).length;

  const averageScore =
    rows.length === 0
      ? 0
      : Math.round(
          rows.reduce(
            (total, row) =>
              total + Number(row.grand_total || 0),
            0
          ) / rows.length
        );

if (checkingSession || !admin) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p>Verifying admin session...</p>
    </div>
  );
}
  return (
    <div className="admin-dashboard">
      {/* SIDEBAR */}

      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <img
            src="/logo_bulk.png"
            alt="Lumut Port"
          />

          <span>ADMIN PORTAL</span>
        </div>

        <nav className="admin-sidebar-nav">
          <Link
            href="/admin/dashboard"
            className="admin-nav-link active"
          >
            <span className="admin-nav-icon">
              ⌂
            </span>

            Dashboard
          </Link>

          <Link
            href="/admin/new"
            className="admin-nav-link"
          >
            <span className="admin-nav-icon">
              ＋
            </span>

            New Evaluation
          </Link>

          <a
            href="#evaluation-records"
            className="admin-nav-link"
          >
            <span className="admin-nav-icon">
              ▤
            </span>

            All Evaluations
          </a>
        </nav>

        <div className="admin-sidebar-management">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleImportFile}
            style={{ display: 'none' }}
            aria-label="Choose Excel file to import"
          />
          <span className="admin-menu-label">
            MANAGEMENT
          </span>

          <button
            type="button"
            className="admin-nav-link admin-nav-button"
            onClick={handleImport}
            disabled={excelBusy !== null}
          >
            <span className="admin-nav-icon">
              ↑
            </span>

            {excelBusy === 'import' ? 'Importing...' : 'Import Excel'}
          </button>

          <button
            type="button"
            className="admin-nav-link admin-nav-button"
            onClick={handleExport}
            disabled={excelBusy !== null}
          >
            <span className="admin-nav-icon">
              ↓
            </span>

            {excelBusy === 'export' ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>

        <div className="admin-sidebar-bottom">
          <div className="admin-profile">
            <div className="admin-avatar">
              {admin?.name?.charAt(0).toUpperCase() || 'A'}
            </div>

            <div>
              <strong>
                {admin?.name || 'Administrator'}
              </strong>

              <span>
                {admin?.email || 'Lumut Port'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="admin-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* MAIN */}

      <main className="admin-main">
        {/* TOP BAR */}

        <header className="admin-topbar">
          <div>
            <span className="admin-top-label">
              ADMINISTRATION
            </span>

            <h1>
              Admin Dashboard
            </h1>

            <p>
              Manage all interview evaluation records
            </p>
          </div>

          <div className="admin-top-actions">
            <Link
              href="/"
              className="admin-secondary-button"
            >
              User Dashboard
            </Link>

            <Link
              href="/admin/new"
              className="admin-primary-button"
            >
              + New Evaluation
            </Link>
          </div>
        </header>

        <div className="admin-content">
          {excelMessage && (
            <div role="status" aria-live="polite" style={{ padding: '12px 16px', marginBottom: 16, background: '#fff', border: '1px solid #d5dce5', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
              {excelMessage}
            </div>
          )}
          {/* WELCOME */}

          <section className="admin-welcome">
            <div>
              <span>
                INTERVIEW EVALUATION SYSTEM
              </span>

              <h2>
                Administration Overview
              </h2>

              <p>
                View and manage all interview
                evaluations submitted through the
                system.
              </p>
            </div>

            <div className="admin-welcome-mark">
              LP
            </div>
          </section>

          {/* SUMMARY */}

          <section className="admin-stats">
            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                ▤
              </div>

              <div>
                <span>
                  Total Evaluations
                </span>

                <strong>
                  {loading
                    ? '—'
                    : rows.length}
                </strong>

                <small>
                  All evaluation records
                </small>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                ✓
              </div>

              <div>
                <span>
                  Recommended
                </span>

                <strong>
                  {loading
                    ? '—'
                    : recommendedCount}
                </strong>

                <small>
                  Recommended candidates
                </small>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                ×
              </div>

              <div>
                <span>
                  Not Recommended
                </span>

                <strong>
                  {loading
                    ? '—'
                    : notRecommendedCount}
                </strong>

                <small>
                  Other candidates
                </small>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                ★
              </div>

              <div>
                <span>
                  Average Score
                </span>

                <strong>
                  {loading
                    ? '—'
                    : `${averageScore}/60`}
                </strong>

                <small>
                  Overall average
                </small>
              </div>
            </div>
          </section>

          {/* RECORDS */}

          <section
            className="admin-records-card"
            id="evaluation-records"
          >
            <div className="admin-records-heading">
              <div>
                <h2>
                  Evaluation Records
                </h2>

                <p>
                  All interview evaluations in the
                  system
                </p>
              </div>

              <div className="admin-record-count">
                {filteredRows.length}{' '}
                {filteredRows.length === 1
                  ? 'record'
                  : 'records'}
              </div>
            </div>

            {/* FILTERS */}

            <div className="admin-filters">
              <div className="admin-search">
                <span>⌕</span>

                <input
                  type="text"
                  placeholder="Search ID, candidate or position..."
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </div>

              <select
                className="admin-filter-select"
                value={recommendationFilter}
                onChange={(event) =>
                  setRecommendationFilter(
                    event.target.value
                  )
                }
              >
                <option value="All">
                  All Recommendations
                </option>

                <option value="Recommended">
                  Recommended
                </option>

                <option value="Not Recommended">
                  Not Recommended
                </option>
              </select>

              <button
                type="button"
                className="admin-filter-button"
                onClick={() => {
                  setSearch('');
                  setRecommendationFilter('All');
                }}
              >
                Clear
              </button>
            </div>

            {/* TABLE */}

            <div className="admin-table-wrapper">
              <table className="admin-table">
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
                      Interview Date
                    </th>

                    <th>
                      Main
                    </th>

                    <th>
                      HSE
                    </th>

                    <th>
                      Total
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
                        colSpan={10}
                        className="admin-table-message"
                      >
                        Loading evaluation records...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="admin-table-message"
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
                          <strong className="admin-id">
                            {
                              row.evaluation_id
                            }
                          </strong>
                        </td>

                        <td>
                          <div className="admin-candidate">
                            <span className="admin-candidate-avatar">
                              {row.candidate_name
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <strong>
                              {
                                row.candidate_name
                              }
                            </strong>
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
                          {row.main_total}/50
                        </td>

                        <td>
                          {row.hse_total}/10
                        </td>

                        <td>
                          <strong className="admin-score">
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
                          <span className="admin-recommendation">
                            {
                              row.recommendation
                            }
                          </span>
                        </td>

                        <td>
                          <div className="admin-row-actions">
                            <Link
                              href={`/admin/view/${encodeURIComponent(row.evaluation_id)}`}
                              className="admin-view-action"
                            >
                              View
                            </Link>

                            <Link
                              href={`/admin/edit/${encodeURIComponent(row.evaluation_id)}`}
                              className="admin-edit-action"
                            >
                              Edit
                            </Link>

                            <button
                              type="button"
                              className="admin-delete-action"
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