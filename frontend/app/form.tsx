
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Mode = 'user' | 'admin';

type FormProps = {
  edit?: boolean;
  mode?: Mode;
};

type EvaluationData = {
  candidate_name: string;
  applied_position: string;
  date_of_interview: string;
  scores: Record<string, number>;
  overall_evaluation: string;
  overall_comment: string;
  recommendation: string;
  relationship_declaration: string;
  relationship_name: string;
  relationship_detail: string;
  conflict_of_interest: string;
  fair_process_declaration: string;
  interviewer_name: string;
  interviewer_designation: string;
  interviewer_signature?: string;
  signature_url?: string;
};

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

const criteriaDescriptions: Record<string, string[]> = {
  Appearance: [
    'Untidy or inappropriate appearance for the role',
    'Acceptable but lacks polish, room for improvement',
    'Neat and appropriately dressed',
    'Well-groomed and presents a professional image',
    'Exceptional presentation, highly professional and confident appearance',
  ],
  'Working Experience': [
    'No relevant work experience',
    'Limited experience with minimal relevance',
    'Some related experience, adequate exposure',
    'Solid background and relevant past roles',
    'Highly relevant, extensive experience directly aligned with the position',
  ],
  'Communication Skills': [
    'Struggles to express ideas clearly, difficult to understand',
    'Communicates with difficulty, needs prompting',
    'Communicates adequately, generally understood',
    'Speaks clearly, confidently, and stays on point',
    'Articulate, persuasive, and highly effective communicator',
  ],
  'Mental Alertness': [
    'Appears disinterested or confused, slow to respond',
    'Basic understanding, but lacks deeper insight',
    'Understands questions, able to respond reasonably',
    'Quickly grasps questions and responds thoughtfully',
    'Highly alert, processes information rapidly and responds insightfully',
  ],
  'Expression of Ideas': [
    'Incoherent or disorganized, lacks structure',
    'Ideas are underdeveloped or scattered',
    'Able to convey thoughts with some clarity',
    'Presents ideas logically and coherently',
    'Expresses ideas with clarity, depth and strong logic',
  ],
  'Scholastic Achievement': [
    'Below required education level',
    'Meets minimum requirement but not in related field',
    'Meets all the educational requirements',
    'Qualified in the relevant field of study',
    'Exceeds requirements with relevant advanced qualifications or certifications',
  ],
  Initiative: [
    'Passive and disengaged, shows no initiative',
    'Shows minimal curiosity or motivation',
    'Satisfactory enthusiasm, responds to questions',
    'Shows interest and asks relevant questions',
    'Proactive, enthusiastic and demonstrates leadership potential',
  ],
  Determination: [
    'Lacks drive or personal goals',
    'Appears unmotivated or easily discouraged',
    'Shows basic ambition and desire for improvement',
    'Demonstrates clear goals and motivation to grow',
    'Highly motivated, ambitious, and committed to personal development',
  ],
  Personality: [
    'Uncomfortable or overly nervous, poor interpersonal fit',
    'Timid or reserved, lacks openness',
    'Pleasant and interacts reasonably well',
    'Confident, personable, and engaging',
    'Outstanding interpersonal skills, highly likable and composed',
  ],
  Confidence: [
    'Insecure, hesitant, or overly arrogant',
    'Lack of confidence or too submissive',
    'Reasonably confident, balanced demeanor',
    'Self-assured and responds with poise',
    'Exceptionally confident, attentive, and charismatic',
  ],
};

const hseDescriptions: Record<string, string[]> = {
  'General HSE Knowledge': [
    'Poor understanding of basic HSE principles',
    'Limited knowledge of common workplace hazards',
    'Fair understanding of HSE concepts and terminology',
    'Good knowledge of HSE principles, hazard identification and risk assessment',
    'Excellent grasp of HSE regulations, best practices and proactive safety management',
  ],
  'HSE Experience': [
    'No prior HSE experience',
    'Some awareness of HSE procedures',
    'Participated in HSE training or committees',
    'Assisted in implementing safety measures or conducting inspections',
    'Led HSE initiatives, managed incidents and ensured regulatory compliance',
  ],
};

const initialData: EvaluationData = {
  candidate_name: '',
  applied_position: '',
  date_of_interview: '',
  scores: {},
  overall_evaluation: '',
  overall_comment: '',
  recommendation: '',
  relationship_declaration: '',
  relationship_name: '',
  relationship_detail: '',
  conflict_of_interest: 'No',
  fair_process_declaration: 'No',
  interviewer_name: '',
  interviewer_designation: '',
};

type ScoreSectionProps = {
  title: string;
  criteria: string[];
  descriptions: Record<string, string[]>;
  scores: Record<string, number>;
  onChange: (criterion: string, score: number) => void;
};

function ScoreSection({
  title,
  criteria,
  descriptions,
  scores,
  onChange,
}: ScoreSectionProps) {
  return (
    <section className="card">
      <h2>{title}</h2>

      <div className="score-table-grid">
        <div className="row score-header">
          <div className="criteria">Criteria</div>
          {[1, 2, 3, 4, 5].map((score) => (
            <div key={score}>{score}</div>
          ))}
        </div>

        {criteria.map((criterion) => (
          <div className="row" key={criterion}>
            <div className="criteria">{criterion}</div>

            {[1, 2, 3, 4, 5].map((score) => (
              <div className="rating-cell" key={score}>
                <label className="radio">
                  <input
                    type="radio"
                    name={`score-${criterion}`}
                    value={score}
                    checked={scores[criterion] === score}
                    onChange={() => onChange(criterion, score)}
                    required
                  />
                  <span className="rating-description">
                    {descriptions[criterion]?.[score - 1]}
                  </span>
                </label>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Form({
  edit = false,
  mode = 'user',
}: FormProps) {
  const router = useRouter();
  const params = useParams();

  const id = edit ? String(params.id || '') : '';
  const isAdmin = mode === 'admin';

  // Separate navigation for User and Admin.
  const dashboardUrl = isAdmin ? '/admin/dashboard' : '/';

  const viewUrl = isAdmin
    ? `/admin/view/${id}`
    : `/view/${id}`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const signatureLoadedRef = useRef(false);

  const [data, setData] = useState<EvaluationData>(initialData);
  const [loaded, setLoaded] = useState(!edit);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureCleared, setSignatureCleared] = useState(false);

  const updateField = (
    field: keyof EvaluationData,
    value: string
  ) => {
    setData((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateScore = (criterion: string, score: number) => {
    setData((previous) => ({
      ...previous,
      scores: {
        ...previous.scores,
        [criterion]: score,
      },
    }));
  };

  // Load existing evaluation.
  useEffect(() => {
    if (!edit || !id) return;

    let cancelled = false;

    async function loadEvaluation() {
      try {
        if (!isAdmin) {
          const session = await fetch(`${API}/api/user/session`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!session.ok) throw new Error('Unable to initialize user session.');
        }
        const response = await fetch(
          `${API}/api/evaluations/${encodeURIComponent(id)}?mode=${mode}`,
          {
            credentials: 'include',
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error('Unable to load evaluation.');
        }

        const result = await response.json();

        if (!cancelled) {
          setData({
            ...initialData,
            ...result,
            scores: result.scores || {},
          });
          setLoaded(true);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          alert('Unable to load evaluation.');
          router.push(dashboardUrl);
        }
      }
    }

    loadEvaluation();

    return () => {
      cancelled = true;
    };
  }, [edit, id, mode, isAdmin, router, dashboardUrl]);

  // Signature canvas setup.
  useEffect(() => {
    if (!loaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.parentElement?.clientWidth || 500;
    const height = 180;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#000000';

    const position = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();

      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const start = (event: PointerEvent) => {
      event.preventDefault();
      drawingRef.current = true;

      setHasDrawn(true);
      setSignatureCleared(false);

      const point = position(event);

      context.beginPath();
      context.moveTo(point.x, point.y);

      canvas.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent) => {
      if (!drawingRef.current) return;

      event.preventDefault();

      const point = position(event);

      context.lineTo(point.x, point.y);
      context.stroke();
    };

    const stop = (event: PointerEvent) => {
      drawingRef.current = false;
      context.closePath();

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    return () => {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', stop);
      canvas.removeEventListener('pointercancel', stop);
    };
  }, [loaded]);

  // Restore saved signature when editing.
  useEffect(() => {
    if (!edit || !loaded || signatureLoadedRef.current) return;

    const signature =
      data.signature_url || data.interviewer_signature;

    if (!signature || signature === 'CLEAR') return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) return;

    const image = new Image();

    image.onload = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.width / ratio;
      const height = canvas.height / ratio;

      const scale = Math.min(
        width / image.width,
        height / image.height
      );

      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      context.drawImage(
        image,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );

      signatureLoadedRef.current = true;
    };

    image.src = signature.startsWith('data:image/')
      ? signature
      : `${API}${signature.startsWith('/') ? '' : '/'}${signature}`;
  }, [
    edit,
    loaded,
    data.signature_url,
    data.interviewer_signature,
  ]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;

    context.clearRect(
      0,
      0,
      canvas.width / ratio,
      canvas.height / ratio
    );

    setHasDrawn(false);
    setSignatureCleared(true);
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (saving) return;

    const allCriteria = [...mainCriteria, ...hseCriteria];

    if (allCriteria.some((criterion) => !data.scores[criterion])) {
      alert('Please complete all evaluation ratings.');
      return;
    }

    setSaveError('');
    setSaving(true);

    try {
      let signature: string | undefined;

      if (signatureCleared) {
        signature = 'CLEAR';
      } else if (hasDrawn) {
        signature = canvasRef.current?.toDataURL('image/png');
      }

      
      // The backend derives created_by from the authenticated session.
      const { interviewer_signature: _previousSignature, signature_url: _signatureUrl, ...fields } = data;
      const body = {
        ...fields,
        ...(signature !== undefined
          ? { interviewer_signature: signature }
          : {}),
      };

      if (!isAdmin) {
        const sessionResponse = await fetch(`${API}/api/user/session`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!sessionResponse.ok) {
          throw new Error(`User session failed (${sessionResponse.status}).`);
        }

        // A successful session response does not guarantee the browser
        // accepted the cookie. Verify it before attempting to save.
        const verifyResponse = await fetch(`${API}/api/user/session`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const verified = verifyResponse.ok
          ? await verifyResponse.json()
          : null;
        if (!verified?.active) {
          throw new Error(
            'User session cookie was not saved by the browser. Check frontend/backend domains and cookie settings.'
          );
        }
      }

      const url = edit
        ? `${API}/api/evaluations/${encodeURIComponent(id)}?mode=${mode}`
        : `${API}/api/evaluations?mode=${mode}`;

      const response = await fetch(url, {
        method: edit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Save failed (${response.status}): ${detail}`);
      }

      // Confirm the API returned the saved evaluation before navigating.
      const saved = await response.json();
      if (!saved?.evaluation_id) {
        throw new Error('Save response did not contain an evaluation ID.');
      }

      alert(edit ? 'Evaluation updated successfully.' : 'Evaluation saved successfully.');
      router.replace(edit
        ? `${isAdmin ? '/admin/view' : '/view'}/${encodeURIComponent(saved.evaluation_id)}`
        : dashboardUrl);
      router.refresh();
    } catch (error) {
      console.error('Evaluation save failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to save evaluation.';
      setSaveError(message);
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <main className="container">
        <section className="card">Loading evaluation...</section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div className="logo">
          <img src="/logo_bulk.png" alt="Lumut Port" />
        </div>

        <div>
          <h1>
            {edit
              ? 'Edit Interview Evaluation'
              : 'New Interview Evaluation'}
          </h1>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        {/* CANDIDATE INFORMATION */}
        <section className="card">
          <h2>Candidate Information</h2>

          <div className="grid-3">
            <label>
              Candidate Name
              <input
                type="text"
                value={data.candidate_name}
                onChange={(event) =>
                  updateField('candidate_name', event.target.value)
                }
                required
              />
            </label>

            <label>
              Applied Position
              <input
                type="text"
                value={data.applied_position}
                onChange={(event) =>
                  updateField('applied_position', event.target.value)
                }
                required
              />
            </label>

            <label>
              Date of Interview
              <input
                type="date"
                value={String(data.date_of_interview || '').slice(0, 10)}
                onChange={(event) =>
                  updateField('date_of_interview', event.target.value)
                }
                required
              />
            </label>
          </div>
        </section>

        {/* MAIN EVALUATION */}
        <ScoreSection
          title="Main Evaluation Criteria"
          criteria={mainCriteria}
          descriptions={criteriaDescriptions}
          scores={data.scores}
          onChange={updateScore}
        />

        {/* HSE EVALUATION */}
        <ScoreSection
          title="Additional Criteria (HSE)"
          criteria={hseCriteria}
          descriptions={hseDescriptions}
          scores={data.scores}
          onChange={updateScore}
        />

        {/* OVERALL EVALUATION */}
        <section className="card">
          <h2>Overall Evaluation</h2>

          <div className="grid-2">
            <label>
              Overall Evaluation
              <select
                value={data.overall_evaluation}
                onChange={(event) =>
                  updateField('overall_evaluation', event.target.value)
                }
                required
              >
                <option value="">-- Select --</option>
                <option value="Poor">Poor</option>
                <option value="Fair">Fair</option>
                <option value="Average">Average</option>
                <option value="Good">Good</option>
                <option value="Superior">Superior</option>
              </select>
            </label>

            <label>
              Recommendation
              <select
                value={data.recommendation}
                onChange={(event) =>
                  updateField('recommendation', event.target.value)
                }
                required
              >
                <option value="">-- Select --</option>
                <option value="Recommend for employment">
                  Recommend for employment
                </option>
                <option value="Recommend interview for other position">
                  Recommend interview for other position
                </option>
                <option value="Not recommended">
                  Not recommended
                </option>
              </select>
            </label>
          </div>

          <label>
            Overall Comment
            <textarea
              rows={4}
              value={data.overall_comment}
              onChange={(event) =>
                updateField('overall_comment', event.target.value)
              }
            />
          </label>
        </section>

        {/* DECLARATION */}
        <section className="card">
          <h2>Declaration</h2>

          <p>
            I, the undersigned member of the interview panel,
            hereby declare that:
          </p>

          <div className="declaration-form">
            <div className="declaration-question">
              <span className="declaration-label">
                Do you have any relatives/relationship with the candidate?
              </span>

              <div className="declaration-options">
                {['No', 'Yes'].map((option) => (
                  <label className="option-label" key={option}>
                    <input
                      type="radio"
                      name="relationship_declaration"
                      value={option}
                      checked={data.relationship_declaration === option}
                      onChange={() => {
                        setData((previous) => ({
                          ...previous,
                          relationship_declaration: option,
                          relationship_name:
                            option === 'No'
                              ? ''
                              : previous.relationship_name,
                          relationship_detail:
                            option === 'No'
                              ? ''
                              : previous.relationship_detail,
                        }));
                      }}
                      required
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>

            {data.relationship_declaration === 'Yes' && (
              <div className="relationship-fields">
                <label>
                  Name of Related Person
                  <input
                    type="text"
                    value={data.relationship_name}
                    onChange={(event) =>
                      updateField(
                        'relationship_name',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  Relationship
                  <input
                    type="text"
                    value={data.relationship_detail}
                    onChange={(event) =>
                      updateField(
                        'relationship_detail',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              </div>
            )}
          </div>

          <div className="declaration-checkbox">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={data.conflict_of_interest === 'Yes'}
                onChange={(event) =>
                  updateField(
                    'conflict_of_interest',
                    event.target.checked ? 'Yes' : 'No'
                  )
                }
                required
              />
              <span>
                I have no conflict of interest that may affect my
                impartiality in assessing the candidate.
              </span>
            </label>
          </div>

          <div className="declaration-checkbox">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={data.fair_process_declaration === 'Yes'}
                onChange={(event) =>
                  updateField(
                    'fair_process_declaration',
                    event.target.checked ? 'Yes' : 'No'
                  )
                }
                required
              />
              <span>
                We shall conduct the interview process fairly,
                transparently, and based solely on merit and the
                candidate&apos;s qualifications, experience and
                performance during the interview.
              </span>
            </label>
          </div>
        </section>

        {/* INTERVIEWER INFORMATION */}
        <section className="card">
          <h2>Interviewed By</h2>

          <div className="grid-3">
            <label>
              Name
              <input
                type="text"
                value={data.interviewer_name}
                onChange={(event) =>
                  updateField('interviewer_name', event.target.value)
                }
                required
              />
            </label>

            <div>
              <label>Signature</label>

              <div
                className="signature"
                style={{
                  width: '100%',
                  maxWidth: 500,
                  height: 180,
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 180,
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                />
              </div>

              <button
                type="button"
                className="btn secondary"
                onClick={clearSignature}
              >
                Clear Signature
              </button>

              <p className="small">
                Draw using mouse, trackpad or touchscreen.
              </p>
            </div>

            <label>
              Designation
              <input
                type="text"
                value={data.interviewer_designation}
                onChange={(event) =>
                  updateField(
                    'interviewer_designation',
                    event.target.value
                  )
                }
                required
              />
            </label>
          </div>
        </section>

        {saveError && (
          <section className="card" role="alert" style={{ color: '#b91c1c' }}>
            <strong>Unable to save evaluation</strong>
            <p>{saveError}</p>
          </section>
        )}

        {/* ACTION BUTTONS */}
        <div className="actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => router.push(dashboardUrl)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn primary"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : edit
                ? 'Update Evaluation'
                : 'Save Evaluation'}
          </button>
        </div>
      </form>
    </main>
  );
}
