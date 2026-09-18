'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Rec = {
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

export default function Home() {
  const [rows, setRows] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);

    fetch(`${API}/api/evaluations`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm('Are you sure you want to delete this evaluation?')) {
      return;
    }

    const response = await fetch(`${API}/api/evaluations/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      alert('Unable to delete evaluation.');
      return;
    }

    load();
  }

  return (
    <main className="container">
      <header className="header">
        <div className="logo">
          <img src="/logo_bulk.png" alt="Lumut Port" />
        </div>

        <h1>Interview Evaluation System</h1>
      </header>

      <div className="top-action">
        <Link className="btn primary" href="/new">
          + New Evaluation
        </Link>
      </div>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Evaluation Records</h2>
            <p className="section-subtitle">
              List of completed interview evaluations
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="records-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Candidate</th>
                <th>Position</th>
                <th>Date</th>
                <th>Main /50</th>
                <th>HSE /10</th>
                <th>Total /60</th>
                <th>Overall</th>
                <th>Recommendation</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="empty-row">
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-row">
                    No evaluation records found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.evaluation_id}>
                    <td>
                      <strong>{r.evaluation_id}</strong>
                    </td>

                    <td>{r.candidate_name}</td>

                    <td>{r.applied_position}</td>

                    <td>{r.date_of_interview}</td>

                    <td>{r.main_total}/50</td>

                    <td>{r.hse_total}/10</td>

                    <td>
                      <strong>{r.grand_total}/60</strong>
                    </td>

                    <td>{r.overall_evaluation}</td>

                    <td>{r.recommendation}</td>

                    <td>
                      <div className="table-actions">
                        <Link
                          className="btn action-view"
                          href={`/view/${r.evaluation_id}`}
                        >
                          View
                        </Link>

                        <Link
                          className="btn action-edit"
                          href={`/edit/${r.evaluation_id}`}
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          className="btn action-delete"
                          onClick={() => del(r.evaluation_id)}
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
    </main>
  );
}