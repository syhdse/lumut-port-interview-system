'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

const API =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const main = [
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

const hse = [
  'General HSE Knowledge',
  'HSE Experience',
];

/*
 * ==========================================================
 * RATING DESCRIPTIONS
 * ==========================================================
 */

const criteriaDescriptions: Record<string, string[]> = {
  Appearance: [
    'Untidy or inappropriate appearance for the role',
    'Acceptable but lack polish, room for improvement',
    'Neat and appropriately dressed',
    'Well-groomed and present a professional image',
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
    'Speaks clearly, confidently, and stay on point',
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
    'Express ideas with clarity, depth and strong logic',
  ],

  'Scholastic Achievement': [
    'Below required education level',
    'Meets minimum requirement but not in related field',
    'Meets all the educational requirement',
    'Qualified in the relevant field of study',
    'Exceed requirements with relevant advanced qualifications or certifications',
  ],

  Initiative: [
    'Passive and disengaged, shows no initiative',
    'Shows minimal curiosity or motivation',
    'Satisfactory enthusiasm, responds to questions',
    'Shows interest and ask relevant questions',
    'Proactive, enthusiastic and demonstrates leadership potential',
  ],

  Determination: [
    'Lack drive or personal goals',
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
    'Fair understanding of HSE concepts & terminology',
    'Good knowledge of HSE principles, hazard identification & risk assessment',
    'Excellent grasp of HSE regulations, best practices & proactive safety management',
  ],

  'HSE Experience': [
    'No prior HSE experience',
    'Some awareness of HSE procedures',
    'Participated in HSE training or committees',
    'Assisted in implementing safety measures or conducting inspections',
    'Led HSE initiatives, managed incidents & ensured regulatory compliance',
  ],
};

export default function Form({
  edit = false,
}: {
  edit?: boolean;
}) {
  const router = useRouter();
  const params = useParams();

  const id = edit ? String(params.id) : '';

  const canvas = useRef<HTMLCanvasElement>(null);

  const [data, setData] = useState<any>({
    scores: {},
  });

  const [loaded, setLoaded] = useState(!edit);

  const [clear, setClear] = useState(false);

  const [hasDrawn, setHasDrawn] = useState(false);

  /*
   * ==========================================================
   * LOAD EXISTING EVALUATION
   * ==========================================================
   */

  useEffect(() => {
    if (!edit) return;

    fetch(`${API}/api/evaluations/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error('Unable to load evaluation.');
        }

        return r.json();
      })
      .then((x) => {
        setData(x);
        setLoaded(true);
      })
      .catch((err) => {
        console.error(err);
        alert('Unable to load evaluation.');
        router.push('/');
      });
  }, [edit, id, router]);

  /*
   * ==========================================================
   * SETUP SIGNATURE CANVAS
   * ==========================================================
   */

  useEffect(() => {
    const c = canvas.current;

    if (!c) return;

    const parent = c.parentElement;

    if (!parent) return;

    const rect = parent.getBoundingClientRect();

    const width = Math.max(rect.width, 300);
    const height = 180;

    const ratio = window.devicePixelRatio || 1;

    c.width = width * ratio;
    c.height = height * ratio;

    c.style.width = `${width}px`;
    c.style.height = `${height}px`;

    const ctx = c.getContext('2d');

    if (!ctx) return;

    ctx.scale(ratio, ratio);

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';

    let drawing = false;

    const getPosition = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();

      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      };
    };

    const startDrawing = (e: PointerEvent) => {
      e.preventDefault();

      drawing = true;

      setClear(false);
      setHasDrawn(true);

      const pos = getPosition(e);

      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);

      c.setPointerCapture?.(e.pointerId);
    };

    const draw = (e: PointerEvent) => {
      if (!drawing) return;

      e.preventDefault();

      const pos = getPosition(e);

      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stopDrawing = (e: PointerEvent) => {
      if (!drawing) return;

      drawing = false;

      ctx.closePath();

      try {
        c.releasePointerCapture?.(e.pointerId);
      } catch {}
    };

    c.addEventListener(
      'pointerdown',
      startDrawing
    );

    c.addEventListener(
      'pointermove',
      draw
    );

    c.addEventListener(
      'pointerup',
      stopDrawing
    );

    c.addEventListener(
      'pointercancel',
      stopDrawing
    );

    return () => {
      c.removeEventListener(
        'pointerdown',
        startDrawing
      );

      c.removeEventListener(
        'pointermove',
        draw
      );

      c.removeEventListener(
        'pointerup',
        stopDrawing
      );

      c.removeEventListener(
        'pointercancel',
        stopDrawing
      );
    };
  }, []);

  /*
   * ==========================================================
   * LOAD EXISTING SIGNATURE DURING EDIT
   * ==========================================================
   */

  useEffect(() => {
    if (!edit) return;

    if (!loaded) return;

    if (!data.signature_url) return;

    const c = canvas.current;

    if (!c) return;

    const ctx = c.getContext('2d');

    if (!ctx) return;

    const image = new Image();

    image.onload = () => {
      const ratio =
        window.devicePixelRatio || 1;

      const width =
        c.width / ratio;

      const height =
        c.height / ratio;

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      const scale = Math.min(
        width / image.width,
        height / image.height
      );

      const drawWidth =
        image.width * scale;

      const drawHeight =
        image.height * scale;

      const x =
        (width - drawWidth) / 2;

      const y =
        (height - drawHeight) / 2;

      ctx.drawImage(
        image,
        x,
        y,
        drawWidth,
        drawHeight
      );

      setHasDrawn(false);
      setClear(false);
    };

    image.onerror = () => {
      console.error(
        'Unable to load signature.'
      );
    };

    image.src = data.signature_url.startsWith('data:image/')
  ? data.signature_url
  : `${API}${data.signature_url}`;
  }, [
    edit,
    loaded,
    data.signature_url,
  ]);

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (!loaded) {
    return (
      <main className="container">
        <div className="card">
          Loading...
        </div>
      </main>
    );
  }

  /*
   * ==========================================================
   * FORM HELPERS
   * ==========================================================
   */

  const set = (
    k: string,
    v: any
  ) => {
    setData((d: any) => ({
      ...d,
      [k]: v,
    }));
  };

  const setScore = (
    k: string,
    v: number
  ) => {
    setData((d: any) => ({
      ...d,
      scores: {
        ...d.scores,
        [k]: v,
      },
    }));
  };

  /*
   * ==========================================================
   * CLEAR SIGNATURE
   * ==========================================================
   */

  const clearSignature = () => {
    const c = canvas.current;

    if (!c) return;

    const ctx = c.getContext('2d');

    if (!ctx) return;

    const ratio =
      window.devicePixelRatio || 1;

    ctx.clearRect(
      0,
      0,
      c.width / ratio,
      c.height / ratio
    );

    setClear(true);
    setHasDrawn(false);
  };

  /*
   * ==========================================================
   * SUBMIT
   * ==========================================================
   */

  const submit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    let signature:
      | string
      | undefined;

    if (clear) {
      signature = 'CLEAR';
    } else if (hasDrawn) {
      signature =
        canvas.current?.toDataURL(
          'image/png'
        );
    }

    const body = {
  ...data,
  interviewer_signature:
    signature,
};

//console.log('SUBMIT BODY:', body);
//console.log('API URL:', API);

try {
      const r = await fetch(
        `${API}/api/evaluations${
          edit ? `/${id}` : ''
        }`,
        {
          method: edit
            ? 'PUT'
            : 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify(body),
        }
      );

      if (!r.ok) {
        const error =
          await r.json();

        alert(
          error.detail ||
            'Unable to save evaluation.'
        );

        return;
      }

      alert(
        edit
          ? 'Evaluation updated successfully.'
          : 'Evaluation saved successfully.'
      );

      router.push('/');
      router.refresh();

    } catch (error) {
      console.error(error);

      alert(
        'Unable to connect to the server.'
      );
    }
  };

  /*
   * ==========================================================
   * SCORE COMPONENT
   * ==========================================================
   */

  const Score = ({
    items,
    title,
    descriptions,
  }: {
    items: string[];
    title: string;
    descriptions: Record<string, string[]>;
  }) => (
    <section className="card">

      <h2>{title}</h2>

      <div className="score">

        {/* HEADER */}

        <div className="row head">

          <div>
            {title === 'Interview Evaluation'
              ? 'Rating'
              : 'Additional Criteria'}
          </div>

          <div>1</div>
          <div>2</div>
          <div>3</div>
          <div>4</div>
          <div>5</div>

        </div>


        {/* CRITERIA */}

        {items.map((c) => (

          <div
            className="row"
            key={c}
          >

            <div className="criteria">
              {c}
            </div>


            {[1, 2, 3, 4, 5].map(
              (n) => (

                <div
                  key={n}
                  className="rating-cell"
                >

                  <label className="radio">

                    <input
                      type="radio"
                      name={c}
                      value={n}
                      checked={
                        Number(
                          data.scores?.[c]
                        ) === n
                      }
                      onChange={() =>
                        setScore(c, n)
                      }
                      required
                    />

                    <span className="rating-description">
                      {descriptions[c]?.[
                        n - 1
                      ] || `Rating ${n}`}
                    </span>

                  </label>

                </div>

              )
            )}

          </div>

        ))}

      </div>

    </section>
  );

  /*
   * ==========================================================
   * PAGE
   * ==========================================================
   */

  return (
    <main className="container">

      {/* HEADER */}

      <header className="header">

        <div className="logo">

          <img
            src="/logo_bulk.png"
            alt="Lumut Port"
          />

        </div>

        <h1>
          {edit
            ? `Edit Evaluation - ${id}`
            : 'Interview Evaluation Form'}
        </h1>

      </header>


      <form onSubmit={submit}>

        {/* ==================================================
            CANDIDATE INFORMATION
        ================================================== */}

        <section className="card">

          <h2>
            Candidate Information
          </h2>

          <div className="grid-3">

            <label>
              Candidate Name

              <input
                value={
                  data.candidate_name ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'candidate_name',
                    e.target.value
                  )
                }
                required
              />

            </label>


            <label>
              Applied Position

              <input
                value={
                  data.applied_position ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'applied_position',
                    e.target.value
                  )
                }
                required
              />

            </label>


            <label>
              Date of Interview

              <input
                type="date"
                value={
                  data.date_of_interview ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'date_of_interview',
                    e.target.value
                  )
                }
                required
              />

            </label>

          </div>

        </section>


        {/* ==================================================
            INTERVIEW EVALUATION
        ================================================== */}

        <Score
          items={main}
          title="Interview Evaluation"
          descriptions={
            criteriaDescriptions
          }
        />


        {/* ==================================================
            HSE
        ================================================== */}

        <Score
          items={hse}
          title="Additional Criteria (HSE)"
          descriptions={
            hseDescriptions
          }
        />


        {/* ==================================================
            OVERALL EVALUATION
        ================================================== */}

        <section className="card">

          <h2>
            Overall Evaluation
          </h2>

          <div className="grid-2">

            <label>
              Overall

              <select
                value={
                  data.overall_evaluation ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'overall_evaluation',
                    e.target.value
                  )
                }
                required
              >

                <option value="">
                  -- Select --
                </option>

                {[
                  'Poor',
                  'Fair',
                  'Average',
                  'Good',
                  'Superior',
                ].map((x) => (

                  <option
                    key={x}
                    value={x}
                  >
                    {x}
                  </option>

                ))}

              </select>

            </label>


            <label>
              Recommendation

              <select
                value={
                  data.recommendation ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'recommendation',
                    e.target.value
                  )
                }
                required
              >

                <option value="">
                  -- Select --
                </option>

                {[
                  'Recommend for employment',
                  'Recommend interview for other position',
                  'Not recommended',
                ].map((x) => (

                  <option
                    key={x}
                    value={x}
                  >
                    {x}
                  </option>

                ))}

              </select>

            </label>

          </div>


          <label>

            Overall Comment

            <textarea
              rows={4}
              value={
                data.overall_comment ||
                ''
              }
              onChange={(e) =>
                set(
                  'overall_comment',
                  e.target.value
                )
              }
            />

          </label>

        </section>


        {/* ==================================================
            DECLARATION
        ================================================== */}

        <section className="card">

          <h2>
            Declaration
          </h2>


          <p>
            I, the undersigned member of the interview panel,
            hereby declare that:
          </p>


          {/* RELATIONSHIP */}

          <div className="declaration-form">

            <div className="declaration-question">

              <span className="declaration-label">
                Do you have any relatives/relationship with the candidate?
              </span>


              <div className="declaration-options">

                <label className="option-label">

                  <input
                    type="radio"
                    name="relationship_declaration"
                    value="No"
                    checked={
                      data.relationship_declaration ===
                      'No'
                    }
                    onChange={() => {

                      set(
                        'relationship_declaration',
                        'No'
                      );

                      set(
                        'relationship_name',
                        ''
                      );

                      set(
                        'relationship_detail',
                        ''
                      );

                    }}
                    required
                  />

                  <span>
                    No
                  </span>

                </label>


                <label className="option-label">

                  <input
                    type="radio"
                    name="relationship_declaration"
                    value="Yes"
                    checked={
                      data.relationship_declaration ===
                      'Yes'
                    }
                    onChange={() =>
                      set(
                        'relationship_declaration',
                        'Yes'
                      )
                    }
                  />

                  <span>
                    Yes
                  </span>

                </label>

              </div>

            </div>


            {/* SHOW ONLY WHEN YES */}

            {data.relationship_declaration ===
              'Yes' && (

              <div className="relationship-fields">

                <label>

                  Name of Related Person

                  <input
                    type="text"
                    value={
                      data.relationship_name ||
                      ''
                    }
                    onChange={(e) =>
                      set(
                        'relationship_name',
                        e.target.value
                      )
                    }
                    required
                  />

                </label>


                <label>

                  Relationship

                  <input
                    type="text"
                    value={
                      data.relationship_detail ||
                      ''
                    }
                    onChange={(e) =>
                      set(
                        'relationship_detail',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Friend, Relative, Former Colleague"
                    required
                  />

                </label>

              </div>

            )}

          </div>


          {/* CONFLICT OF INTEREST */}

          <div className="declaration-checkbox">

            <label className="checkbox-label">

              <input
                type="checkbox"
                checked={
                  data.conflict_of_interest ===
                  'Yes'
                }
                onChange={(e) =>
                  set(
                    'conflict_of_interest',
                    e.target.checked
                      ? 'Yes'
                      : 'No'
                  )
                }
                required
              />

              <span>
                I have no conflict of interest that may affect
                my impartiality in assessing the candidate.
              </span>

            </label>

          </div>


          {/* FAIR PROCESS */}

          <div className="declaration-checkbox">

            <label className="checkbox-label">

              <input
                type="checkbox"
                checked={
                  data.fair_process_declaration ===
                  'Yes'
                }
                onChange={(e) =>
                  set(
                    'fair_process_declaration',
                    e.target.checked
                      ? 'Yes'
                      : 'No'
                  )
                }
                required
              />

              <span>
                We shall conduct the interview process fairly,
                transparently, and based solely on merit and
                the candidate's qualifications, experience,
                and performance during the interview.
              </span>

            </label>

          </div>

        </section>


        {/* ==================================================
            INTERVIEWED BY
        ================================================== */}

        <section className="card">

          <h2>
            Interviewed By
          </h2>


          <div className="grid-3">

            {/* NAME */}

            <label>

              Name

              <input
                value={
                  data.interviewer_name ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'interviewer_name',
                    e.target.value
                  )
                }
                required
              />

            </label>


            {/* SIGNATURE */}

            <div>

              <label>
                Signature
              </label>


              <div
                className="signature"
                style={{
                  width: '100%',
                  maxWidth: '500px',
                  height: '180px',
                  border:
                    '1px solid #ccc',
                  borderRadius: '8px',
                  background:
                    '#fff',
                  overflow: 'hidden',
                }}
              >

                <canvas
                  ref={canvas}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '180px',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                />

              </div>


              <button
                type="button"
                className="btn secondary"
                onClick={
                  clearSignature
                }
              >
                Clear Signature
              </button>


              <p className="small">
                Draw using mouse,
                trackpad or touchscreen.
              </p>

            </div>


            {/* DESIGNATION */}

            <label>

              Designation

              <input
                value={
                  data.interviewer_designation ||
                  ''
                }
                onChange={(e) =>
                  set(
                    'interviewer_designation',
                    e.target.value
                  )
                }
                required
              />

            </label>

          </div>

        </section>


        {/* ==================================================
            ACTION BUTTONS
        ================================================== */}

        <div className="actions">

          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              router.push('/')
            }
          >
            Cancel
          </button>


          <button
            type="submit"
            className="btn primary"
          >
            {edit
              ? 'Update Evaluation'
              : 'Save Evaluation'}
          </button>

        </div>

      </form>

    </main>
  );
}