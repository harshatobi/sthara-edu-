'use client';

import React from 'react';
import Link from 'next/link';

export default function TmlWhitepaperPage() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="whitepaper-root">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');

        :root {
          --oxford: #002147;
          --crimson: #E11D48;
          --slate-900: #0F172A;
          --slate-700: #334155;
          --slate-500: #64748B;
          --slate-100: #F1F5F9;
          --emerald: #10B981;
          --amber: #F59E0B;
        }

        body {
          background-color: #F8FAFC;
          color: var(--slate-900);
          font-family: 'Plus Jakarta Sans', sans-serif;
          margin: 0;
          padding: 0;
        }

        .no-print-bar {
          background: #002147;
          color: white;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }

        .btn-print {
          background: #E11D48;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: transform 0.2s, background 0.2s;
        }

        .btn-print:hover {
          background: #BE123C;
          transform: translateY(-1px);
        }

        .doc-container {
          max-width: 900px;
          margin: 40px auto;
          background: white;
          padding: 60px 70px;
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06);
          border: 1px solid #E2E8F0;
        }

        .doc-header {
          border-bottom: 3px solid var(--oxford);
          padding-bottom: 24px;
          margin-bottom: 36px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .doc-title {
          font-size: 32px;
          font-weight: 800;
          color: var(--oxford);
          margin: 0;
          letter-spacing: -0.02em;
        }

        .doc-subtitle {
          font-size: 15px;
          color: var(--crimson);
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 6px;
        }

        .meta-badge {
          background: #F1F5F9;
          border: 1px solid #E2E8F0;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          color: var(--slate-700);
          text-align: right;
        }

        h2 {
          font-size: 22px;
          font-weight: 800;
          color: var(--oxford);
          margin-top: 36px;
          margin-bottom: 16px;
          border-left: 4px solid var(--crimson);
          padding-left: 12px;
        }

        h3 {
          font-size: 17px;
          font-weight: 700;
          color: var(--slate-900);
          margin-top: 24px;
          margin-bottom: 10px;
        }

        p {
          font-size: 15px;
          line-height: 1.7;
          color: var(--slate-700);
          margin-bottom: 16px;
        }

        .formula-box {
          background: #001A38;
          color: #E2E8F0;
          border-radius: 16px;
          padding: 24px 28px;
          margin: 24px 0;
          font-family: 'JetBrains Mono', monospace;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .formula-title {
          color: #F5B60B;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .formula-math {
          font-size: 18px;
          font-weight: 700;
          color: #FFFFFF;
          margin: 8px 0 14px;
          line-height: 1.5;
        }

        .formula-desc {
          font-size: 13px;
          color: #94A3B8;
          line-height: 1.6;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin: 24px 0;
          font-size: 14px;
        }

        th {
          background: var(--oxford);
          color: white;
          text-align: left;
          padding: 12px 16px;
          font-weight: 700;
        }

        td {
          padding: 12px 16px;
          border-bottom: 1px solid #E2E8F0;
          color: var(--slate-700);
        }

        tr:nth-child(even) {
          background: #F8FAFC;
        }

        .badge-green { background: #DCFCE7; color: #166534; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .badge-amber { background: #FEF3C7; color: #92400E; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .badge-red { background: #FEE2E2; color: #991B1B; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px; }

        .callout {
          background: #EFF6FF;
          border-left: 4px solid #3B82F6;
          padding: 16px 20px;
          border-radius: 0 12px 12px 0;
          margin: 20px 0;
          font-size: 14.5px;
          color: #1E40AF;
        }

        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #E2E8F0;
          text-align: center;
          font-size: 12px;
          color: var(--slate-500);
        }

        /* PRINT MEDIA STYLES */
        @media print {
          .no-print-bar { display: none !important; }
          body { background: white !important; }
          .doc-container {
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
          }
          .formula-box {
            background: #f8fafc !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
          }
          .formula-title { color: #b45309 !important; }
          .formula-math { color: #002147 !important; }
          .formula-desc { color: #334155 !important; }
          th { background: #002147 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .badge-green, .badge-amber, .badge-red { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Top Navbar for Screen */}
      <div className="no-print-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/teacher/mastery" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
            ← Back to Mastery Dashboard
          </Link>
          <span style={{ opacity: 0.3 }}>|</span>
          <b style={{ fontSize: '15px' }}>Sthara School OS — TML Whitepaper</b>
        </div>
        <button onClick={handlePrint} className="btn-print">
          <span>📥 Save as PDF / Print</span>
        </button>
      </div>

      {/* Main Printable Document */}
      <div className="doc-container">
        {/* Document Header */}
        <div className="doc-header">
          <div>
            <h1 className="doc-title">Sthara True Mastery Level (TML)</h1>
            <div className="doc-subtitle">Algorithmic Specification &amp; Grading Whitepaper</div>
          </div>
          <div className="meta-badge">
            <div>VERSION: 2.4.0</div>
            <div>STATUS: CBSE ALIGNED</div>
            <div>STHARA OS / DIAGNOSTIC ENGINE</div>
          </div>
        </div>

        {/* Executive Summary */}
        <h2>1. Executive Summary &amp; Core Philosophy</h2>
        <p>
          Traditional educational scoring relies on aggregate raw percentages that treat all assessments equally regardless of recency, question difficulty, or learning context. <b>True Mastery Level (TML)</b> is Sthara School OS’s multi-factorial diagnostic algorithm designed for K-12 (CBSE / ICSE) environments.
        </p>
        <p>
          TML replaces simple averages with a <b>continuously updated, time-decayed, multi-source mastery score</b> calculated per student, per subject, and per micro-topic. It directly feeds the Class Heat Map, Teacher Diagnostic Dashboard, and AI Socratic Tutor.
        </p>

        {/* Master Formula */}
        <h2>2. Core Mathematical Formulations</h2>

        <div className="formula-box">
          <div className="formula-title">EQUATION 1: COMPOSITE TOPIC TML FORMULA</div>
          <div className="formula-math">
            TML<sub>s, t</sub> = (w<sub>hw</sub> &times; H<sub>s,t</sub>) + (w<sub>qz</sub> &times; Q<sub>s,t</sub>) + (w<sub>tu</sub> &times; D<sub>s,t</sub>)
          </div>
          <div className="formula-desc">
            Where:<br />
            • <b>H<sub>s,t</sub></b> = Time-decayed Proctored Homework &amp; Classwork Score (Default weight <b>w<sub>hw</sub> = 0.40</b>)<br />
            • <b>Q<sub>s,t</sub></b> = Timed Proctored Quiz Accuracy Score (Default weight <b>w<sub>qz</sub> = 0.40</b>)<br />
            • <b>D<sub>s,t</sub></b> = AI Socratic Tutor Depth Score (Default weight <b>w<sub>tu</sub> = 0.20</b>)<br />
            • <b>s</b> = Student ID, <b>t</b> = Micro-topic Tag (e.g., <i>Chapter 10: Circles &amp; Tangents</i>)
          </div>
        </div>

        <h3>2.2 Time-Decay Recency Weighting for Homework (H<sub>s,t</sub>)</h3>
        <p>
          A homework score earned 60 days ago does not accurately reflect a student's current mastery today. TML applies exponential decay to historical assessment submissions using a half-life of <b>t<sub>1/2</sub> = 14 days</b> (&lambda; = &ln; 2 / 14 &approx; 0.0495).
        </p>

        <div className="formula-box">
          <div className="formula-title">EQUATION 2: EXPONENTIAL TIME-DECAY ASSESSMENT WEIGHTING</div>
          <div className="formula-math">
            H<sub>s,t</sub> = &sum; [ S<sub>i</sub> &times; e<sup>-&lambda; (T<sub>now</sub> - T<sub>i</sub>)</sup> ] / &sum; [ e<sup>-&lambda; (T<sub>now</sub> - T<sub>i</sub>)</sup> ]
          </div>
          <div className="formula-desc">
            • <b>S<sub>i</sub></b> = Percentage score on assessment <i>i</i><br />
            • <b>T<sub>now</sub> - T<sub>i</sub></b> = Age of assessment <i>i</i> in days<br />
            • Ensures recent learning carries significantly higher weight while preserving long-term mastery history.
          </div>
        </div>

        <h3>2.3 Proctored Quiz Accuracy Formula (Q<sub>s,t</sub>)</h3>
        <p>
          Unlike homework, timed proctored quizzes evaluate question-level Bloom difficulty weights (&theta;<sub>k</sub>), time-efficiency multipliers (&tau;<sub>k</sub>), and proctoring integrity penalties (&delta;<sub>proctor</sub>) for tab switching.
        </p>

        <div className="formula-box">
          <div className="formula-title">EQUATION 3: PROCTORED QUIZ MASTERY FORMULA</div>
          <div className="formula-math">
            Q<sub>s,t</sub> = &delta;<sub>proctor</sub> &times; [ &sum; ( &theta;<sub>k</sub> &times; R<sub>s,k</sub> &times; &tau;<sub>k</sub> ) / &sum; &theta;<sub>k</sub> ] &times; 100%
          </div>
          <div className="formula-desc">
            • <b>R<sub>s,k</sub> &isin; &#123;0, 1&#125;</b> = Binary correctness for question <i>k</i> on topic <i>t</i><br />
            • <b>&theta;<sub>k</sub></b> = Question Difficulty Weight (Easy = 1.0, Medium = 1.5, HOTS/Olympiad = 2.5)<br />
            • <b>&tau;<sub>k</sub></b> = Speed Efficiency Multiplier (1.05 for fast &amp; accurate; 0.90 for last-second guessing)<br />
            • <b>&delta;<sub>proctor</sub></b> = Proctoring Integrity Factor: <code>max(0.50, 1.0 - 0.15 &times; V<sub>switches</sub>)</code> (Applies 15% penalty per tab switch)
          </div>
        </div>

        <h3>2.4 Statistical Confidence Factor (C)</h3>
        <p>
          To prevent single-quiz anomalies from producing false high/low scores, TML evaluates a confidence factor based on data points (N<sub>data</sub>):
        </p>
        <div className="formula-box">
          <div className="formula-title">EQUATION 3: CONFIDENCE EVALUATION</div>
          <div className="formula-math">
            &mathcal;C<sub>s,t</sub> = min( 1.0 , N<sub>data</sub> / 5 )
          </div>
          <div className="formula-desc">
            • <b>N<sub>data</sub> &lt; 2</b> &rarr; <i>Insufficient Data</i> (Displayed as "—" on Heat Map)<br />
            • <b>2 &le; N<sub>data</sub> &lt; 5</b> &rarr; <i>Provisional TML</i> (&plusmn;8% margin of error)<br />
            • <b>N<sub>data</sub> &ge; 5</b> &rarr; <i>Firm TML</i> (High statistical validity)
          </div>
        </div>

        {/* Grading Scale & Bands */}
        <h2>3. TML Mastery Bands &amp; Pedagogical Triggers</h2>
        <p>
          TML scores map directly to five distinct pedagogical action bands within Sthara OS:
        </p>

        <table>
          <thead>
            <tr>
              <th>Mastery Band</th>
              <th>TML Score Range</th>
              <th>Color Code</th>
              <th>System Action &amp; AI Trigger</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Exemplary</b></td>
              <td>90% &ndash; 100%</td>
              <td><span className="badge-green">Deep Emerald (#10B981)</span></td>
              <td>Auto-unlocks advanced Olympiad / HOTS Socratic extension modules.</td>
            </tr>
            <tr>
              <td><b>Proficient</b></td>
              <td>75% &ndash; 89%</td>
              <td><span className="badge-green">Green (#34D399)</span></td>
              <td>CBSE Distinction benchmark. Standard maintenance review schedule.</td>
            </tr>
            <tr>
              <td><b>Developing</b></td>
              <td>50% &ndash; 74%</td>
              <td><span className="badge-amber">Amber (#F5B60B)</span></td>
              <td>Flags specific micro-topic gaps; generates focused practice drills.</td>
            </tr>
            <tr>
              <td><b>Critical Gap</b></td>
              <td>35% &ndash; 49%</td>
              <td><span className="badge-red">Coral Red (#F98A4B)</span></td>
              <td>Triggers mandatory 3-step AI Socratic Tutor session; alerts teacher.</td>
            </tr>
            <tr>
              <td><b>Severe Need</b></td>
              <td>&lt; 35%</td>
              <td><span className="badge-red">Crimson (#E11D48)</span></td>
              <td>Immediate Remediation Plan assigned; logged in Parent WhatsApp feed.</td>
            </tr>
          </tbody>
        </table>

        {/* Subject Level Aggregation */}
        <h2>4. Subject &amp; Class Heat Map Aggregation</h2>
        <p>
          Overall Subject TML (TML<sub>s, Subject</sub>) aggregates micro-topics weighted by curriculum unit importance (W<sub>t</sub>):
        </p>

        <div className="formula-box">
          <div className="formula-title">EQUATION 4: SUBJECT MASTERY AGGREGATION</div>
          <div className="formula-math">
            TML<sub>s, Subject</sub> = &sum; ( W<sub>t</sub> &times; TML<sub>s,t</sub> ) / &sum; W<sub>t</sub>
          </div>
        </div>

        <div className="callout">
          <b>Integrity &amp; Anti-Cheating Safeguard:</b><br />
          During proctored assessments, tab-switching or focus loss applies a 15% confidence penalty (C<sub>penalty</sub> = 0.85), ensuring TML reflects genuine independent competence.
        </div>

        {/* Document Footer */}
        <div className="footer">
          <p><b>Sthara Educational Technologies Pvt. Ltd.</b> &bull; Confidential &amp; Proprietary Documentation</p>
          <p>Designed for CBSE, ICSE, and State Board Institution Implementations.</p>
        </div>
      </div>
    </div>
  );
}
