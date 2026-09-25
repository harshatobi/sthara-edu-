/* Company content incorporates the complete user-supplied sthara_site_v2.html.
 * Source received 2026-09-21; SHA-256 cb953b36ebf2cd5985e04771f53349715fde535d895c1e93f6ffaa0a917b0c2f.
 * Legal wording is preserved; content completeness is not legal approval.
 * See source/CONTENT_AUDIT.md for provenance and verification.
 */

const hero = (label, heading, intro, extra = '') => `
  <section class="company-hero wrap" aria-labelledby="company-heading">
    <a class="company-back" href="/">Back to Sthara</a>
    <p class="company-eyebrow">${label}</p>
    <h1 id="company-heading" tabindex="-1">${heading}</h1>
    <p class="company-intro">${intro}</p>
    ${extra}
  </section>`;

const contents = (page, links) => `
  <nav class="company-toc" aria-label="On this page">
    <p>On this page</p>
    <ul>${links.map(([id, label]) => `<li><a href="/${page}#${id}">${label}</a></li>`).join('')}</ul>
  </nav>`;

const related = (current) => `
  <nav class="company-related wrap" aria-label="Company and policies">
    <p>More about Sthara</p>
    ${[['about', 'About us'], ['privacy', 'Privacy Policy'], ['dpdp', 'DPDP architecture'], ['contact', 'Contact us']]
      .filter(([key]) => key !== current)
      .map(([key, label]) => `<a href="/${key}">${label}<span aria-hidden="true">↗</span></a>`).join('')}
  </nav>`;

export const companyPages = {
  about: {
    title: 'About us | Sthara',
    description: 'Meet the founders of Sthara and the principles behind one living school record for Indian K-12 schools.',
    html: `${hero('About us', 'A child falling behind should never be a surprise.', 'One living record for the student, the teacher, the office and the parent.')}
      <div class="company-layout wrap">
        ${contents('about', [['ab-why', 'Why Sthara exists'], ['ab-leadership', 'The people behind it'], ['ab-principles', 'What we believe'], ['ab-now', 'Working with us']])}
        <div class="company-prose">
          <section class="company-section" id="ab-why" aria-labelledby="about-why-heading">
            <h2 id="about-why-heading">Why Sthara exists</h2>
            <p>Sthara is a unified school operating system for Indian K-12 schools. One living record that the student, the teacher, the office and the parent all read from — so a slipping topic surfaces in the week it slips, not at the end of term.</p>
            <p>In most schools a child's difficulty only becomes visible once it has become a mark. One topic doesn't land. The next chapter assumes it did. By the time anyone measures the gap it has compounded into a result nobody can undo — and no one was negligent, there was simply nothing in the room that was watching.</p>
            <p>Our co-founder lived exactly that as a student, then built the system he wished had existed. It is why the <b>True Mastery Level</b> sits at the centre of Sthara rather than at the edge: one live score per child, built from real classwork, that surfaces a slipping topic while there is still term left to fix it.</p>
            <div class="company-callout">
              <h3>What we do, in one line.</h3>
              <p>We replace the spreadsheet, the WhatsApp group, the tutoring app and the paper register with a single living record that every role in the school reads from.</p>
            </div>
          </section>
          <section class="company-section" id="ab-leadership" aria-labelledby="about-leadership-heading">
            <h2 id="about-leadership-heading">The people behind it</h2>
            <p class="company-section-intro">Three founders. One of them wrote the platform.</p>
            <div class="company-leaders">
              <article class="company-leader company-leader-founder" aria-labelledby="leader-harsha">
                <div class="company-leader-name">
                  <h3 id="leader-harsha">Harsha Payala</h3>
                  <p class="company-position">Co-founder &amp; creator of Sthara<br>President &amp; CEO</p>
                  <p class="company-education">B.Tech, Computer Science</p>
                </div>
                <div class="company-leader-bio">
                  <p>Harsha designed and built the Sthara platform — the AI tutor, the handwriting-grading pipeline and the True Mastery Level engine. He was the student who fell behind on a topic nobody caught in time, and he built Sthara so that it does not happen quietly to anyone else.</p>
                  <p>His standard runs through the whole product: the tutor asks a student what they have already tried before it explains anything, and no AI-generated mark enters a child's record until a teacher has confirmed it.</p>
                  <ul class="company-expertise" aria-label="Harsha's areas of work"><li>Platform architect</li><li>Handwriting OCR</li><li>True Mastery Level</li><li>Product direction</li></ul>
                </div>
              </article>
              <article class="company-leader" aria-labelledby="leader-moses">
                <div class="company-leader-name">
                  <h3 id="leader-moses">Moses Benhur</h3>
                  <p class="company-position">Co-founder<br>Managing Director &amp; CFO</p>
                  <p class="company-education">M.S. Computer Science, University of Bridgeport</p>
                </div>
                <div class="company-leader-bio">
                  <p>An engineer in the finance seat. Moses sets how Sthara is priced and holds it to a single test: an ordinary school should get the same platform as a flagship one, at a price it can actually pay.</p>
                  <ul class="company-expertise" aria-label="Moses's areas of work"><li>Commercial model</li><li>Partnerships</li><li>Finance</li></ul>
                </div>
              </article>
              <article class="company-leader" aria-labelledby="leader-joshua">
                <div class="company-leader-name">
                  <h3 id="leader-joshua">Joshua Stephen</h3>
                  <p class="company-position">Co-founder<br>Chief Operating Officer</p>
                  <p class="company-education">B.Sc. Biotechnology &amp; Genetics, GITAM University<br>Research in behavioural psychology</p>
                </div>
                <div class="company-leader-bio">
                  <p>Joshua came to education through behaviour rather than software. He leads how Sthara is rolled out inside a school, and is the reason wellbeing is treated here as real, kept data a counsellor can act on — not a box ticked for a circular.</p>
                  <ul class="company-expertise" aria-label="Joshua's areas of work"><li>School rollout</li><li>Onboarding &amp; training</li><li>Wellbeing programme</li></ul>
                </div>
              </article>
            </div>
          </section>
          <section class="company-section" id="ab-principles" aria-labelledby="about-principles-heading">
            <h2 id="about-principles-heading">What we believe</h2>
            <p class="company-section-intro">Four things we won't trade away.</p>
            <div class="company-principles">
              <article><h3>Student outcomes before margin</h3><p>When a feature is good for the child and neutral for revenue, it still ships. Our entry tier exists so mainstream schools get the same platform as elite ones.</p></article>
              <article><h3>One record, never four</h3><p>Every module writes to the same living record. We won't ship a feature that creates a second version of the truth about a child.</p></article>
              <article><h3>Teacher time is sacred</h3><p>AI earns its place by giving hours back — grading, lesson prep, report drafting. If it adds a step for a teacher, it doesn't ship.</p></article>
              <article><h3>Children's data is children's data</h3><p>Role-based access, audit trails, Indian data residency, and no advertising to children — ever. See our <a href="/dpdp">DPDP architecture</a>.</p></article>
            </div>
          </section>
          <section class="company-section" id="ab-now" aria-labelledby="about-working-heading">
            <h2 id="about-working-heading">Working with us</h2>
            <p>Sthara is founder-led, and we intend to keep it that way. When your school contacts us you reach a founder — not a ticket queue — and every school on the platform keeps a direct line to one of us for as long as they are with us.</p>
            <div class="company-callout">
              <h3>Where to start.</h3>
              <p>New school enquiries, demos and pilots go to Sales and Operations. Partnership, contract and finance conversations go to our COO and CFO. Both routes are on the <a href="/contact">contact page</a>.</p>
            </div>
          </section>
        </div>
      </div>${related('about')}`
  },
  privacy: {
    title: "Privacy Policy | Sthara",
    description: "How Sthara collects, uses, stores and protects personal data across the School OS platform.",
    html: `${hero("Legal", "Privacy Policy", "How Sthara collects, uses, stores and protects personal data — including the personal data of children — across the Sthara School OS platform.", "<ul class=\"company-meta\" aria-label=\"Published policy details\"><li>Effective 26 July 2026</li><li>Version 2.0</li><li>Applies to sthara.in &amp; the Sthara app</li></ul>")}
      <div class="company-layout wrap">
        ${contents("privacy", [["pp-who","1 · Who we are"],["pp-roles","2 · Our role vs. the school's"],["pp-collect","3 · What we collect"],["pp-why","4 · Why we process it"],["pp-children","5 · Children's data"],["pp-ai","6 · AI processing"],["pp-never","7 · What we never do"],["pp-share","8 · Who we share with"],["pp-residency","9 · Where data is stored"],["pp-retention","10 · Retention &amp; deletion"],["pp-security","11 · Security"],["pp-rights","12 · Your rights"],["pp-grievance","13 · Grievance redressal"],["pp-changes","14 · Changes"]])}
        <div class="company-prose company-legal company-legal-complete">
<div class="company-callout">
          <b>In one paragraph.</b> Sthara processes school data so a school can run itself and see how each child is doing. The school decides what is collected and why; we process it on the school's written instruction. We do not sell data, we do not advertise to children, we do not profile children for commercial purposes, and we store data in India.
        </div>

        <h2 id="pp-who">1 · Who we are</h2>
        <p>Sthara ("Sthara", "we", "us") operates the Sthara School OS — a unified school operating system for K-12 schools in India, available at <b>sthara.in</b> and through the Sthara application. This policy covers the website, the application, and all four role experiences (student, teacher, administrator, parent).</p>
        <p>For any question about this policy, write to <a href="mailto:coo@sthara.in">coo@sthara.in</a>.</p>

        <h2 id="pp-roles">2 · Our role, and the school's role</h2>
        <p>Under India's <b>Digital Personal Data Protection Act, 2023 ("DPDP Act")</b> the allocation of responsibility matters, so we state it plainly:</p>
        <div class="company-table-scroll" role="region" aria-label="Policy details" tabindex="0"><table class="company-table"><thead><tr><th scope="col">Party</th><th scope="col">Role under the DPDP Act</th><th scope="col">What that means</th></tr></thead><tbody>
          <tr><td><b>The school</b></td><td>Data Fiduciary</td><td>Decides which student, parent and staff data is collected, for what purpose, and obtains the required consent from parents and guardians.</td></tr>
          <tr><td><b>Sthara</b></td><td>Data Processor</td><td>Processes that data only on the school's instruction, under a written contract, for the purpose of delivering the platform.</td></tr>
          <tr><td><b>Student / parent / staff</b></td><td>Data Principal</td><td>The individual whose personal data is processed, holding the rights set out in section 12 below.</td></tr>
        </tbody></table></div>
        <p>Because the school is the Data Fiduciary, requests to access, correct or erase a child's data are raised with the school, which we then action. We do not independently make decisions about a child's data.</p>

        <h2 id="pp-collect">3 · What we collect</h2>
        <h3>Student data (provided by the school)</h3>
        <ul>
          <li>Identity and enrolment: name, class/section, roll number, school-issued ID, academic year</li>
          <li>Academic activity: assignments issued, submissions (including photographs of handwritten work), marks, teacher corrections, quiz responses</li>
          <li>Attendance records</li>
          <li>True Mastery Level (TML) scores and topic-level mastery derived from the above</li>
          <li>Interactions with the AI tutor (questions asked and the tutoring exchange)</li>
        </ul>
        <h3>Parent / guardian data</h3>
        <ul>
          <li>Name, relationship to the student, mobile number (used for WhatsApp updates), email address</li>
          <li>Fee and payment records associated with the student's account</li>
        </ul>
        <h3>Staff data</h3>
        <ul>
          <li>Name, role, school email, class and subject allocation, activity within the platform</li>
        </ul>
        <h3>Technical data</h3>
        <ul>
          <li>Authentication events, IP address, device and browser type, and audit-trail logs of actions taken in the platform</li>
        </ul>
        <div class="company-callout">
          <b>Not enabled by default.</b> Optional wellbeing features that would ask a student to self-report how they are feeling (energy check-ins) are <b>off by default</b> and are not enabled for any school until an explicit, separate guardian-consent flow is in place for that school. No school is enrolled in them silently.
        </div>

        <h2 id="pp-why">4 · Why we process it</h2>
        <div class="company-table-scroll" role="region" aria-label="Policy details" tabindex="0"><table class="company-table"><thead><tr><th scope="col">Purpose</th><th scope="col">Data used</th></tr></thead><tbody>
          <tr><td>Deliver AI tutoring to the student</td><td>Tutor exchanges, topic mastery, subject enrolment</td></tr>
          <tr><td>Grade photographed handwritten homework and return corrections</td><td>Submission images, assignment definition</td></tr>
          <tr><td>Compute and display the True Mastery Level</td><td>Marks, submissions, quizzes, tutor engagement, attendance</td></tr>
          <tr><td>Run school administration — attendance, fees, admissions, reporting</td><td>Enrolment, attendance, fee records</td></tr>
          <tr><td>Send progress, homework and fee updates to parents</td><td>Parent mobile number, student activity summary</td></tr>
          <tr><td>Generate NEP 2020 records and CBSE-format wellness reports</td><td>Academic and engagement signals already held</td></tr>
          <tr><td>Security, audit and abuse prevention</td><td>Authentication and audit logs</td></tr>
          <tr><td>Billing the school</td><td>Enrolled student counts, school contact and finance details</td></tr>
        </tbody></table></div>
        <p>We do not process personal data for any purpose outside this list without the school's written instruction.</p>

        <h2 id="pp-children">5 · Children's data</h2>
        <p>Most Data Principals on our platform are children. We treat that as the defining constraint on the product, not a footnote.</p>
        <ul>
          <li><b>Consent comes through the guardian, via the school.</b> The school obtains verifiable consent from the parent or lawful guardian before a child's account is activated, as required by section 9 of the DPDP Act.</li>
          <li><b>No behavioural advertising to children.</b> We serve no advertising of any kind, and we run no advertising or marketing trackers in the student experience.</li>
          <li><b>No commercial profiling or tracking of children.</b> Mastery scoring exists to help a teacher intervene academically. It is never used to build a commercial profile, and it is never sold or shared for commercial purposes.</li>
          <li><b>Nothing that is detrimental to a child's wellbeing.</b> Features are assessed against this standard before release.</li>
          <li><b>Guardian visibility.</b> A parent can see their own child's record, and only their own child's record.</li>
        </ul>

        <h2 id="pp-ai">6 · AI processing</h2>
        <p>Sthara uses <b>Google's Gemini API</b> to power AI tutoring, handwriting recognition and grading, and report drafting. When a student asks the tutor a question or submits a photograph of handwritten work, that content is sent to the model provider to generate the response or the grading.</p>
        <ul>
          <li>Content is sent for the sole purpose of returning the tutoring reply, the grade, or the drafted report.</li>
          <li>AI-generated marks are surfaced to a teacher for confirmation — the teacher, not the model, is the authority on a child's mark.</li>
          <li>We do not use student personal data to train publicly available AI models, and we contract with our model provider on enterprise terms rather than consumer terms.</li>
          <li>Where a model output is used to flag a student as at-risk, that flag is advisory to a human being. No consequential decision about a child is taken by the system alone.</li>
        </ul>

        <h2 id="pp-never">7 · What we never do</h2>
        <ul>
          <li>We never sell personal data. There is no circumstance in which student data is a product we monetise.</li>
          <li>We never serve advertising, and never share data with advertising networks or data brokers.</li>
          <li>We never share one school's data with another school.</li>
          <li>We never allow a teacher, parent or student to see data outside their role's scope.</li>
        </ul>

        <h2 id="pp-share">8 · Who we share data with</h2>
        <p>We share personal data only with sub-processors necessary to run the platform, each under contract and each restricted to the purpose stated:</p>
        <div class="company-table-scroll" role="region" aria-label="Policy details" tabindex="0"><table class="company-table"><thead><tr><th scope="col">Sub-processor</th><th scope="col">Purpose</th></tr></thead><tbody>
          <tr><td>Google Cloud / Gemini API</td><td>AI tutoring, handwriting OCR and grading, report drafting</td></tr>
          <tr><td>Managed PostgreSQL provider</td><td>System of record — the living student record</td></tr>
          <tr><td>Application hosting provider</td><td>Serving the web application</td></tr>
          <tr><td>WhatsApp Business API</td><td>Delivering parent notifications and reminders</td></tr>
          <tr><td>Payment gateway (where the school enables online fees)</td><td>Processing fee payments</td></tr>
        </tbody></table></div>
        <p>We will also disclose data where compelled by law or by a lawful order of an Indian court or authority. We disclose the minimum necessary and, unless legally prohibited, notify the school.</p>

        <h2 id="pp-residency">9 · Where data is stored</h2>
        <p>Sthara data is <b>hosted in India</b>. Where a sub-processor necessarily processes data outside India (for example, AI inference), that processing is limited to the transaction concerned and is governed by contract; we do not relocate the system of record outside India.</p>

        <h2 id="pp-retention">10 · Retention and deletion</h2>
        <ul>
          <li>Data is retained while the school's subscription is active, because a school's purpose is to maintain a continuous academic record.</li>
          <li>On termination, the school may export its full data set. We then delete or irreversibly anonymise personal data within <b>90 days</b>, except where a specific statutory retention obligation applies.</li>
          <li>Audit logs are retained for a defined security window and then purged on a rolling basis.</li>
          <li>A school may instruct us to delete a specific individual's data at any time; we action such instructions.</li>
        </ul>

        <h2 id="pp-security">11 · Security</h2>
        <ul>
          <li><b>Role-based access control.</b> Student, teacher, administrator and parent each see only what their role permits. Access is least-privilege by design, not by policy alone.</li>
          <li><b>Encryption in transit</b> for all data moving between the client, our services and our sub-processors.</li>
          <li><b>Full audit trail.</b> Consequential actions in the platform are logged with actor, timestamp and object.</li>
          <li><b>Segregation.</b> Each school's data is logically segregated; no cross-school access path exists in the application.</li>
          <li><b>Breach response.</b> On becoming aware of a personal data breach we notify the affected school and the Data Protection Board of India as required, and provide the school what it needs to notify affected Data Principals.</li>
        </ul>

        <h2 id="pp-rights">12 · Your rights</h2>
        <p>As a Data Principal — or as the parent or lawful guardian of one — you have the right to:</p>
        <ul>
          <li><b>Access</b> a summary of the personal data being processed and the processing activities undertaken</li>
          <li><b>Correction</b> of inaccurate or incomplete data, and <b>completion</b> or <b>updating</b> of it</li>
          <li><b>Erasure</b> of personal data where the purpose for which it was collected no longer applies and no law requires its retention</li>
          <li><b>Grievance redressal</b> through the channel in section 13, before escalating to the Data Protection Board</li>
          <li><b>Nomination</b> of another individual to exercise these rights in the event of death or incapacity</li>
        </ul>
        <p>Because the school is the Data Fiduciary, please raise these requests with your school in the first instance. If the school does not resolve it, contact us directly using section 13 and we will work with the school to close it.</p>

        <h2 id="pp-grievance">13 · Grievance redressal</h2>
        <p>Grievances regarding personal data handled by Sthara are received by our <b>Chief Operating Officer</b>:</p>
        <div class="company-callout">
          <b>Grievance channel:</b> <a href="mailto:coo@sthara.in">coo@sthara.in</a><br>
          <b>Acknowledgement:</b> within 3 working days · <b>Resolution target:</b> within 30 days
        </div>
        <p>If your grievance is not resolved, you may escalate it to the <b>Data Protection Board of India</b> under the DPDP Act, 2023.</p>

        <h2 id="pp-changes">14 · Changes to this policy</h2>
        <p>We will update this policy as the platform and the law develop. Material changes are notified to schools in writing before they take effect, and the effective date at the top of this page is revised. Continued use of the platform after the effective date constitutes acceptance of the revised policy.</p>

        <div class="company-callout">
          <b>This page is a privacy notice, not legal advice</b>, and it is not a certification of compliance by any authority. For how the platform is architected against the DPDP Act specifically, see <a href="/dpdp">Built for the DPDP Act</a>.
        </div>
        </div>
      </div>${related("privacy")}`
  },
  dpdp: {
    title: "DPDP architecture | Sthara",
    description: "How Sthara describes its architecture against the Digital Personal Data Protection Act, 2023.",
    html: `${hero("Trust", "Built for the DPDP Act, 2023.", "India's Digital Personal Data Protection Act sets the rules for handling personal data — and sets a higher bar again for the personal data of children. Almost every Data Principal on our platform is a child. This page sets out, obligation by obligation, how Sthara is architected against that Act.", "")}
      <div class="company-layout wrap">
        ${contents("dpdp", [["dp-act","What the Act requires"],["dp-who","Who is who"],["dp-map","Obligation → architecture"],["dp-children","The children's clause"],["dp-residency","Data residency"],["dp-sub","Sub-processors"],["dp-open","Sensitive features"],["dp-school","What the school must do"]])}
        <div class="company-prose company-legal company-legal-complete">
<div class="company-callout">
          <b>How to read this page.</b> Compliance under the DPDP Act is a shared obligation: the school is the Data Fiduciary, Sthara is the Data Processor. This page sets out precisely what we have built on our side of that line, so your board can see what it is getting before it signs. It describes our architecture and is not legal advice.
        </div>

        <h2 id="dp-act">What the Act requires</h2>
        <p>The <b>Digital Personal Data Protection Act, 2023</b> governs the processing of digital personal data in India. Its core structure is straightforward:</p>
        <ul>
          <li>Personal data may be processed only for a <b>lawful purpose</b>, with <b>consent</b> or under a listed legitimate use.</li>
          <li>Consent must be <b>free, specific, informed, unconditional and unambiguous</b>, given after a clear notice, and must be as easy to withdraw as to give.</li>
          <li>Processing must be <b>limited to the stated purpose</b> and to the data <b>necessary</b> for it.</li>
          <li>Data must be kept <b>accurate</b>, secured with <b>reasonable safeguards</b>, and <b>erased</b> once the purpose is served.</li>
          <li><b>Children get extra protection:</b> verifiable guardian consent is mandatory, and tracking, behavioural monitoring and targeted advertising directed at children are prohibited.</li>
          <li>Data Principals hold rights of <b>access, correction, erasure, grievance redressal and nomination</b>.</li>
          <li>Breaches must be <b>notified</b> to the Data Protection Board and to affected individuals.</li>
        </ul>

        <h2 id="dp-who">Who is who, in a school deployment</h2>
        <div class="company-table-scroll" role="region" aria-label="Policy details" tabindex="0"><table class="company-table"><thead><tr><th scope="col">Party</th><th scope="col">Role</th><th scope="col">Responsibility</th></tr></thead><tbody>
          <tr><td><b>The school</b></td><td>Data Fiduciary</td><td>Determines purpose and means. Issues notice, obtains verifiable guardian consent, answers Data Principal requests.</td></tr>
          <tr><td><b>Sthara</b></td><td>Data Processor</td><td>Processes only on the school's written instruction. Provides the technical means for the school to meet its obligations.</td></tr>
          <tr><td><b>Student</b></td><td>Data Principal (child)</td><td>Rights exercised by the parent or lawful guardian.</td></tr>
          <tr><td><b>Parent / guardian</b></td><td>Data Principal &amp; consent-giver</td><td>Gives verifiable consent for the child; holds rights over their own data too.</td></tr>
          <tr><td><b>Staff</b></td><td>Data Principal (adult)</td><td>Rights exercised directly.</td></tr>
        </tbody></table></div>

        <h2 id="dp-map">Obligation → how Sthara is architected</h2>
        <div class="company-table-scroll" role="region" aria-label="Policy details" tabindex="0"><table class="company-table"><thead><tr><th scope="col">DPDP obligation</th><th scope="col">How the platform is built for it</th></tr></thead><tbody>
          <tr>
            <td><b>Notice &amp; consent</b><br>Clear notice; free, specific, informed, withdrawable consent</td>
            <td>Consent is captured at school onboarding against named, purpose-scoped processing activities rather than a single blanket acceptance. We supply the school plain-language notice templates. Withdrawal is a supported operation, not a support ticket.</td>
          </tr>
          <tr>
            <td><b>Purpose limitation &amp; data minimisation</b></td>
            <td>The data model carries only fields required to run a school record — enrolment, attendance, submissions, marks, fees, guardian contact. There is no interest, location, contact-list or device-identifier collection. We collect no data whose purpose we cannot name on the privacy page.</td>
          </tr>
          <tr>
            <td><b>Accuracy</b><br>Reasonable effort to keep data correct and complete</td>
            <td>One living record instead of four copies removes the primary source of inaccuracy — divergence between systems. AI-generated marks require teacher confirmation before entering the record, and corrections propagate to every role's view at once.</td>
          </tr>
          <tr>
            <td><b>Storage limitation &amp; erasure</b></td>
            <td>Retention is bounded: on termination the school exports, then personal data is deleted or irreversibly anonymised within 90 days. Individual erasure on school instruction is a supported operation.</td>
          </tr>
          <tr>
            <td><b>Reasonable security safeguards</b></td>
            <td>Role-based access control as a first-class part of the data model (four roles, least privilege), encryption in transit, logical segregation between schools, and no cross-school access path in the application.</td>
          </tr>
          <tr>
            <td><b>Breach notification</b></td>
            <td>An incident runbook with defined severity thresholds, a named internal owner, and notification paths to the affected school and the Data Protection Board of India.</td>
          </tr>
          <tr>
            <td><b>Data Principal rights</b><br>Access, correction, erasure, nomination</td>
            <td>Administrators can export a full per-student record, correct fields, and action erasure — meaning the school can satisfy a request without depending on our support queue. Nomination is recorded at the school level.</td>
          </tr>
          <tr>
            <td><b>Grievance redressal</b></td>
            <td>A published channel with an acknowledgement and resolution SLA — see the <a href="/privacy#pp-grievance">Privacy Policy</a>. Grievances are received by our COO.</td>
          </tr>
          <tr>
            <td><b>Processor obligations</b><br>Process only under contract, on instruction</td>
            <td>Sthara processes solely under a written contract with the school. We take no independent decision about a child's data, and we do not repurpose school data for our own ends.</td>
          </tr>
          <tr>
            <td><b>Full audit trail</b><br>Demonstrability</td>
            <td>Consequential actions are logged with actor, timestamp and object — so a school can evidence who did what to a record, which is what an audit actually asks for.</td>
          </tr>
        </tbody></table></div>

        <h2 id="dp-children">The children's clause — section 9</h2>
        <p>Section 9 is the part of the Act that matters most to us, because it is the part that applies to nearly everyone on the platform. It requires verifiable guardian consent, and it <b>prohibits</b> tracking, behavioural monitoring and targeted advertising directed at children.</p>
        <div class="company-callout">
          <b>Structural, not promissory.</b> Sthara serves no advertising and integrates no advertising or analytics-for-marketing SDKs in the student experience. There is no ad inventory to sell, so there is no commercial incentive to profile a child. The prohibition is satisfied by the absence of the capability, not by a policy asking us to behave.
        </div>
        <ul>
          <li><b>Guardian-linked accounts.</b> Every student account is linked to a guardian record; a parent sees their own child and no other.</li>
          <li><b>Academic scoring is not behavioural profiling.</b> The True Mastery Level exists so a teacher can intervene on a topic in the week it slips. It is not sold, not shared for commercial purposes, and not used to target anything at the child.</li>
          <li><b>No consequential automated decisions.</b> An at-risk flag is advisory to a teacher or counsellor. The system does not decide anything about a child on its own.</li>
          <li><b>Wellbeing standard.</b> Features are assessed against whether they could be detrimental to a child's wellbeing before release — the standard the Act itself sets.</li>
        </ul>

        <h2 id="dp-residency">Data residency</h2>
        <p>The system of record — the living student record — is <b>hosted in India</b>. Where AI inference necessarily occurs at a model provider, that is limited to the specific transaction (a tutoring exchange, a page of handwriting to be graded, a report to be drafted) and is governed by enterprise contract terms. We do not relocate the system of record outside India.</p>

        <h2 id="dp-sub">Sub-processors</h2>
        <p>Every sub-processor is contracted, purpose-limited, and disclosed. The current list is published in section 8 of the <a href="/privacy#pp-share">Privacy Policy</a> and covers AI inference, database, hosting, parent messaging and fee payments. Schools are notified before a sub-processor is added.</p>

        <h2 id="dp-open">Sensitive features ship behind their own consent</h2>
        <p>Not all data about a child carries the same weight, and we do not treat it as if it does. Academic data — marks, attendance, submissions — is what a school already holds and needs to run. Anything that touches a child's <b>emotional state</b> is held to a higher standard.</p>
        <div class="company-callout">
          <b>Our standard.</b> A wellbeing feature that asks a student to self-report how they are feeling requires <b>separate, explicit guardian consent</b> — distinct from general platform consent, independently withdrawable, and never bundled into the terms a school accepts at onboarding.<br><br>
          Until a school has that consent in place, the feature is <b>off</b>. It is disabled by default, no school is enrolled into it silently, and no such data is collected. A school chooses to turn it on, with its parents, or it stays off — and the rest of the platform works exactly the same either way.
        </div>
        <p>The same rule governs anything we add later: if a feature collects something more sensitive than schoolwork, it arrives with its own consent gate or it does not arrive.</p>

        <h2 id="dp-school">What the school still needs to do</h2>
        <p>Sthara gives a school the technical means to comply. It cannot comply on the school's behalf. As Data Fiduciary, the school remains responsible for:</p>
        <ul>
          <li>Issuing the DPDP notice to parents, guardians and staff</li>
          <li>Obtaining and recording <b>verifiable</b> guardian consent before a child's account is activated</li>
          <li>Nominating its own grievance contact and answering Data Principal requests within statutory timelines</li>
          <li>Keeping enrolment and guardian records current, and instructing us to erase data when a student leaves</li>
          <li>Deciding which optional features it enables, and on what consent basis</li>
        </ul>
        <div class="company-callout">
          <b>Want our onboarding pack?</b> We give every school notice templates, a consent-capture checklist and a data-handling summary written for a principal rather than a lawyer. Ask us at <a href="mailto:sales@sthara.in">sales@sthara.in</a>.
        </div>
        </div>
      </div>${related("dpdp")}`
  },
  contact: {
    title: 'Contact us | Sthara',
    description: 'Contact Sthara for school demos, paid pilots, pricing, business enquiries and partnerships.',
    html: `${hero('Contact us', "Let's talk about your school.", 'A demo, a paid pilot, or a conversation about whether Sthara fits your school.')}
      <div class="company-layout wrap">
        ${contents('contact', [['contact-schools', 'School enquiries'], ['contact-business', 'Business & partnerships'], ['contact-enquiry', 'Send an enquiry']])}
        <div class="company-prose">
          <div class="company-contact-routes">
            <section class="company-contact-route" id="contact-schools" aria-labelledby="contact-schools-heading">
              <h2 id="contact-schools-heading">Talk to us about Sthara</h2>
              <p>Demos, paid pilots, pricing, and getting your school live. If you're already with us, this reaches your team too.</p>
              <a class="company-contact-email" href="mailto:sales@sthara.in">sales@sthara.in<span aria-hidden="true">↗</span></a>
            </section>
            <section class="company-contact-route" id="contact-business" aria-labelledby="contact-business-heading">
              <h2 id="contact-business-heading">Business &amp; partnerships</h2>
              <p>Partnerships, commercial terms, contracts and invoicing: anything on the business side rather than the classroom.</p>
              <a class="company-contact-email" href="mailto:coo@sthara.in">coo@sthara.in<span aria-hidden="true">↗</span></a>
            </section>
          </div>
          <section class="company-section company-enquiry-section" id="contact-enquiry" aria-labelledby="contact-enquiry-heading">
            <h2 id="contact-enquiry-heading">Tell us what you need.</h2>
            <p>Choose the enquiry that fits your school or organisation.</p>
            <div data-enquiry-host></div>
          </section>
        </div>
      </div>${related('contact')}`
  }
};
