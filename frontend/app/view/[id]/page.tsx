'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const mainCriteria = [
  'Appearance',
  'Working Experience',
  'Communication Skills',
  'Mental Alertness',
  'Expression of Ideas',
  'Scholastic Achievement',
  'Initiative',
  'Determination',
  'Personality',
  'Confidence',
];

const hseCriteria = [
  'General HSE Knowledge',
  'HSE Experience',
];

export default function View() {
  const { id } = useParams();

  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/evaluations/${id}`)
      .then((r) => r.json())
      .then(setD);
  }, [id]);

  if (!d) {
    return (
      <main className="container">
        <div className="card">Loading...</div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div className="logo">
          <img src="/logo_bulk.png" alt="Lumut Port" />
        </div>

        <h1>Evaluation Result</h1>
      </header>

      {/* Candidate Information */}
      <section className="card">
        <h2>Candidate Information</h2>

        <div className="detail-grid">
          <div className="detail-item">
            <span>Evaluation ID</span>
            <strong>{d.evaluation_id}</strong>
          </div>

          <div className="detail-item">
            <span>Candidate Name</span>
            <strong>{d.candidate_name}</strong>
          </div>

          <div className="detail-item">
            <span>Applied Position</span>
            <strong>{d.applied_position}</strong>
          </div>

          <div className="detail-item">
            <span>Date of Interview</span>
            <strong>{d.date_of_interview}</strong>
          </div>
        </div>
      </section>

      {/* Main Evaluation */}
      <section className="card">
        <h2>Interview Evaluation</h2>

        <div className="answer-table">
          <div className="answer-row answer-header">
            <div>Criteria</div>
            <div>Selected Rating</div>
          </div>

          {mainCriteria.map((criteria) => (
            <div className="answer-row" key={criteria}>
              <div className="answer-criteria">{criteria}</div>

              <div>
                <span className="rating-badge">
                  {d.scores?.[criteria] ?? '-'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="total-box">
          <span>Main Evaluation Total</span>
          <strong>{d.main_total}/50</strong>
        </div>
      </section>

      {/* HSE Evaluation */}
      <section className="card">
        <h2>Additional Criteria (HSE)</h2>

        <div className="answer-table">
          <div className="answer-row answer-header">
            <div>Criteria</div>
            <div>Selected Rating</div>
          </div>

          {hseCriteria.map((criteria) => (
            <div className="answer-row" key={criteria}>
              <div className="answer-criteria">{criteria}</div>

              <div>
                <span className="rating-badge">
                  {d.scores?.[criteria] ?? '-'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="total-box">
          <span>HSE Total</span>
          <strong>{d.hse_total}/10</strong>
        </div>
      </section>

      {/* Overall Evaluation */}
      <section className="card">
        <h2>Overall Evaluation</h2>

        <div className="detail-grid">
          <div className="detail-item">
            <span>Overall Evaluation</span>
            <strong>{d.overall_evaluation}</strong>
          </div>

          <div className="detail-item">
            <span>Recommendation</span>
            <strong>{d.recommendation}</strong>
          </div>
        </div>

        <div className="answer-block">
          <span>Overall Comment</span>
          <p>{d.overall_comment || 'No comment provided.'}</p>
        </div>

        <div className="grand-total">
          <span>Grand Total</span>
          <strong>{d.grand_total}/60</strong>
        </div>
      </section>

      {/* Declaration */}
      <section className="card">
        <h2>Declaration</h2>

        <div className="declaration-result">
          <div className="declaration-item">
            <span>Relationship Declaration</span>
            <strong>{d.relationship_declaration || '-'}</strong>
          </div>

          {d.relationship_declaration === 'Yes' && (
            <>
              <div className="declaration-item">
                <span>Relationship Name</span>
                <strong>{d.relationship_name || '-'}</strong>
              </div>

              <div className="declaration-item">
                <span>Relationship</span>
                <strong>{d.relationship_detail || '-'}</strong>
              </div>
            </>
          )}

          <div className="declaration-item">
            <span>Conflict of Interest</span>
            <strong>{d.conflict_of_interest || '-'}</strong>
          </div>

          <div className="declaration-item">
            <span>Fair Process Declaration</span>
            <strong>{d.fair_process_declaration || '-'}</strong>
          </div>
        </div>
      </section>

      {/* Interviewer */}
      <section className="card">
        <h2>Interviewed By</h2>

        <div className="detail-grid">
          <div className="detail-item">
            <span>Name</span>
            <strong>{d.interviewer_name}</strong>
          </div>

          <div className="detail-item">
            <span>Designation</span>
            <strong>{d.interviewer_designation}</strong>
          </div>
        </div>

        {d.signature_url && (
          <div className="signature-result">
            <span>Signature</span>

            <div className="signature-image-box">
              <img
  src={
    d.signature_url.startsWith('data:image/')
      ? d.signature_url
      : `${API}${d.signature_url}`
  }
  alt="Interviewer Signature"
/>
            </div>
          </div>
        )}
      </section>

      {/* Buttons */}
      <div className="actions page-actions">
        <Link className="btn secondary" href="/">
          Back to Records
        </Link>

        <Link
          className="btn primary"
          href={`/edit/${d.evaluation_id}`}
        >
          Edit
        </Link>

        <button
          type="button"
          className="btn primary"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
    </main>
  );
}