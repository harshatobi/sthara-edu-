import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Sthara School OS',
  description: 'Terms of service for Sthara School OS educational platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12 text-center">
          <Link href="/" className="inline-flex items-center space-x-2 text-[#002147] font-black text-2xl mb-8 hover:opacity-80">
            <span>Sthara School OS</span>
          </Link>
          <h1 className="text-4xl font-black text-[#002147] mb-4">Terms of Service</h1>
          <p className="text-gray-500 font-medium">Last updated: June 27, 2026</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 md:p-12 prose prose-slate max-w-none text-gray-600 leading-relaxed space-y-8">

            <Section title="1. Acceptance">
              <p>
                By registering a school or logging into Sthara School OS, you agree to these Terms of Service.
                If you do not agree, do not use the platform. These terms constitute a legally binding agreement
                between you and Sthara School OS.
              </p>
            </Section>

            <Section title="2. Service Description">
              <p>
                Sthara School OS is a Software-as-a-Service (SaaS) platform providing AI-assisted learning
                management tools including assignment creation, AI grading, student tutoring, quiz generation,
                and wellness monitoring for educational institutions in India.
              </p>
            </Section>

            <Section title="3. Trial & Subscription">
              <ul>
                <li>All new schools receive a <strong>30-day free trial</strong> with full platform access</li>
                <li>After the trial, continued access requires a paid subscription</li>
                <li>Pricing is published on our website and may change with 30 days' notice</li>
                <li>Schools are billed per-institution, not per-user</li>
                <li>Data is retained for 60 days after subscription ends before permanent deletion</li>
              </ul>
            </Section>

            <Section title="4. Acceptable Use">
              <p>You agree not to:</p>
              <ul>
                <li>Use the platform for any purpose other than legitimate educational activities</li>
                <li>Attempt to reverse-engineer, scrape, or overload our API endpoints</li>
                <li>Upload content that is illegal, obscene, or infringes on intellectual property</li>
                <li>Share login credentials with unauthorized parties</li>
                <li>Use AI features to generate content intended to deceive or harm students</li>
              </ul>
            </Section>

            <Section title="5. AI Content Disclaimer">
              <p>
                Sthara uses Google Gemini AI to grade assignments, generate quizzes, and provide tutoring.
                AI-generated content and grades are <strong>advisory only</strong> and must be reviewed by
                qualified teachers before being used for official academic records. Sthara is not liable for
                inaccuracies in AI-generated content.
              </p>
            </Section>

            <Section title="6. Data Ownership">
              <p>
                Your school retains ownership of all data entered into the platform, including student records,
                assignments, and grades. We process this data only to provide the service. Upon termination,
                you may request a data export within 30 days.
              </p>
            </Section>

            <Section title="7. Limitation of Liability">
              <p>
                To the maximum extent permitted by Indian law, Sthara School OS shall not be liable for any
                indirect, incidental, or consequential damages arising from use of the platform. Our total
                liability in any month shall not exceed the subscription fee paid that month.
              </p>
            </Section>

            <Section title="8. Governing Law">
              <p>
                These terms are governed by the laws of India. Any disputes shall be subject to the exclusive
                jurisdiction of courts in Bengaluru, Karnataka, India.
              </p>
            </Section>

            <Section title="9. Contact">
              <p>
                For legal inquiries: <a href="mailto:legal@sthara.in" className="text-blue-600 underline">legal@sthara.in</a>
              </p>
            </Section>

          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/privacy" className="text-[#002147] font-bold hover:underline">Privacy Policy</Link>
          {' · '}
          <Link href="/login" className="text-[#002147] font-bold hover:underline">← Back to Login</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-black text-[#002147] mb-3 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  );
}
