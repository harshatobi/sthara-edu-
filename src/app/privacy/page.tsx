import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Sthara School OS',
  description: 'Privacy policy for Sthara School OS, compliant with the Digital Personal Data Protection Act (DPDP) 2023.',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = 'June 27, 2026';

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <Link href="/" className="inline-flex items-center space-x-2 text-[#002147] font-black text-2xl mb-8 hover:opacity-80 transition-opacity">
            <span>Sthara School OS</span>
          </Link>
          <h1 className="text-4xl font-black text-[#002147] mb-4">Privacy Policy</h1>
          <p className="text-gray-500 font-medium">Last updated: {lastUpdated}</p>
          <div className="mt-4 inline-flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-2">
            <span className="text-blue-700 text-sm font-semibold">🇮🇳 Compliant with DPDP Act 2023</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 md:p-12 prose prose-slate max-w-none">

            <Section title="1. Introduction">
              <p>
                Sthara School OS ("we", "our", or "us") is a cloud-based educational management platform
                operated in India. We are committed to protecting the personal data of all users — students,
                teachers, parents, and administrators — in accordance with the{' '}
                <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> and other applicable laws.
              </p>
              <p>
                This Privacy Policy describes how we collect, use, store, and protect personal data when you
                use our platform. By using Sthara, you consent to the practices described here.
              </p>
            </Section>

            <Section title="2. Who We Are (Data Fiduciary)">
              <p>
                For the purposes of the DPDP Act 2023, <strong>Sthara School OS</strong> is the Data Fiduciary
                responsible for determining the purposes and means of processing your personal data. Each
                registered institution (school) is a separate Data Principal with respect to their students and staff.
              </p>
              <InfoBox>
                📬 <strong>Data Protection Contact:</strong> privacy@sthara.in
              </InfoBox>
            </Section>

            <Section title="3. Data We Collect">
              <p>We collect only the minimum data necessary to provide our services:</p>
              <Table
                headers={['Category', 'Data Collected', 'Purpose']}
                rows={[
                  ['Identity', 'Name, email address, role (student/teacher/admin)', 'Account creation & authentication'],
                  ['Educational', 'Class, subjects, assignment submissions, grades', 'Core learning management'],
                  ['Biometric-adjacent', 'Handwritten answer images (uploaded by student)', 'AI-powered grading only'],
                  ['Wellness', 'Mood check-in values (anonymous numeric score)', 'Classroom wellbeing monitoring'],
                  ['Usage', 'IP address, login timestamps', 'Security & rate limiting'],
                  ['School Info', 'School name, city, curriculum, contact', 'School profile & onboarding'],
                ]}
              />
              <p>
                <strong>We do NOT collect:</strong> Aadhaar numbers, PAN, biometric data, financial information,
                or any sensitive personal data beyond what is listed above.
              </p>
            </Section>

            <Section title="4. How We Use Your Data">
              <ul>
                <li>To provide AI-powered homework grading, tutoring, and quiz generation</li>
                <li>To display student progress reports to teachers and parents</li>
                <li>To enable teacher-student communication through assignments</li>
                <li>To monitor classroom wellness trends (aggregated, not individual)</li>
                <li>To secure the platform against unauthorized access</li>
                <li>To improve our AI models and service quality (anonymized data only)</li>
              </ul>
              <p>
                We do <strong>not</strong> sell, rent, or share your personal data with third parties for
                advertising or marketing purposes.
              </p>
            </Section>

            <Section title="5. Data of Minors (Children Under 18)">
              <p>
                Our platform serves students who may be minors. In compliance with Section 9 of the DPDP Act 2023:
              </p>
              <ul>
                <li>Student accounts are created and managed by the school (the institution acts as guardian)</li>
                <li>We do not serve targeted advertising to any users, especially minors</li>
                <li>Student data is never used to profile individuals for commercial purposes</li>
                <li>Parents can request access to or deletion of their child's data via the school administrator</li>
              </ul>
            </Section>

            <Section title="6. AI Processing & Third-Party Services">
              <p>Our platform uses the following third-party AI and cloud services:</p>
              <Table
                headers={['Service', 'Provider', 'Purpose', 'Data Shared']}
                rows={[
                  ['Gemini AI', 'Google LLC', 'Homework grading, tutoring, quiz generation', 'Assignment text & images (no PII)'],
                  ['Firebase Auth', 'Google LLC', 'User authentication', 'Email, UID'],
                  ['Firestore', 'Google LLC', 'Database storage', 'All structured data'],
                  ['Firebase Storage', 'Google LLC', 'Image storage', 'Submission images'],
                  ['YouTube Data API', 'Google LLC', 'Educational video search', 'Search queries only'],
                ]}
              />
              <p>
                Google LLC processes data under their own privacy policy and Data Processing Agreements
                compliant with international data protection standards. Data is stored in regions that comply
                with Indian data localization requirements where available.
              </p>
            </Section>

            <Section title="7. Data Retention">
              <Table
                headers={['Data Type', 'Retention Period']}
                rows={[
                  ['Student assignments & grades', 'Duration of enrollment + 1 year'],
                  ['Student images (submissions)', '90 days after grading'],
                  ['Chat/tutor conversations', '6 months rolling window'],
                  ['Wellness mood scores', '1 academic year'],
                  ['Login/access logs', '90 days'],
                  ['School records', 'Duration of subscription + 2 years'],
                ]}
              />
            </Section>

            <Section title="8. Your Rights Under the DPDP Act 2023">
              <p>As a Data Principal, you have the following rights:</p>
              <ul>
                <li><strong>Right to Access:</strong> Request a copy of your personal data</li>
                <li><strong>Right to Correction:</strong> Request correction of inaccurate data</li>
                <li><strong>Right to Erasure:</strong> Request deletion of your data (subject to legal holds)</li>
                <li><strong>Right to Grievance Redressal:</strong> Contact our Data Protection Officer</li>
                <li><strong>Right to Nominate:</strong> Nominate someone to exercise rights on your behalf</li>
              </ul>
              <p>
                To exercise these rights, contact your school administrator or email us at{' '}
                <a href="mailto:privacy@sthara.in" className="text-blue-600 underline">privacy@sthara.in</a>.
                We will respond within <strong>72 hours</strong>.
              </p>
            </Section>

            <Section title="9. Security">
              <p>We implement industry-standard security measures including:</p>
              <ul>
                <li>Firebase ID token authentication on all API endpoints</li>
                <li>Rate limiting to prevent abuse and DDoS attacks</li>
                <li>School-level data isolation (multi-tenancy)</li>
                <li>HTTPS-only communication</li>
                <li>Images stored in Firebase Storage (not as database blobs)</li>
                <li>No plaintext password storage (Firebase Auth handles this)</li>
              </ul>
            </Section>

            <Section title="10. Cookies & Session Data">
              <p>We use a minimal session cookie (<code>__session</code>) to maintain your login state across page navigations. This cookie:</p>
              <ul>
                <li>Contains your Firebase ID token</li>
                <li>Expires after 1 hour (refreshed on activity)</li>
                <li>Is deleted when you sign out</li>
                <li>Is not used for tracking or advertising</li>
              </ul>
            </Section>

            <Section title="11. Changes to This Policy">
              <p>
                We may update this policy periodically. When we do, we will update the "Last updated" date
                at the top of this page and notify school administrators via email. Continued use of Sthara
                after changes constitutes acceptance of the revised policy.
              </p>
            </Section>

            <Section title="12. Contact & Grievance Officer">
              <InfoBox>
                <strong>Data Protection Officer / Grievance Officer</strong><br />
                Sthara School OS<br />
                Email: <a href="mailto:privacy@sthara.in" className="underline">privacy@sthara.in</a><br />
                Response time: Within 72 hours<br />
                Escalation: Data Protection Board of India (once operational)
              </InfoBox>
            </Section>

          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/login" className="text-[#002147] font-bold hover:underline">← Back to Login</Link>
          {' · '}
          <Link href="/onboard" className="text-[#002147] font-bold hover:underline">Register Your School →</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-black text-[#002147] mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="text-gray-600 leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 font-medium my-4">
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-3 font-bold text-gray-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-600">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
