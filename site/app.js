(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = document.documentElement;
  const originalTitle = document.title;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  let paused = reducedQuery.matches;
  let selectedRole = 'teacher';
  let storyStep = 0;
  let storyConfirmed = false;
  let storyPlaying = false;
  let storyTimer = null;
  let selectedTier = 2;
  let captures = Object.create(null);
  let objectUrls = new Set();

  const roles = {
    student: {
      name: 'Student', plural: 'Students', title: 'A little help.<br>A bigger understanding.',
      caption: 'A student’s question becomes a new learning signal.',
      description: 'A personal AI tutor that starts with what a student has already tried, then helps them find the next step.',
      features: ['Socratic questions, not just answers', 'Support across subjects', 'Learning connected to the school record'],
      routeTitle: 'Make room for<br><em>every question.</em>',
      routeDescription: 'When a lesson ends, curiosity does not. Sthara gives students a place to ask, practise and return to the ideas they are still working through.',
      steps: [
        ['Start with what you know', 'A tutor conversation begins with the student’s attempt. It can guide the reasoning instead of simply revealing an answer.'],
        ['Keep the work connected', 'Assignments, submissions and teacher feedback belong to the same school experience, not another disconnected learning app.'],
        ['See what to practise next', 'Topic-level learning signals help a student and their teacher choose where to spend the next few minutes.']
      ],
      capture: 'A real tutor conversation, with the question, the student’s attempt and the tutor’s next prompt visible.'
    },
    teacher: {
      name: 'Teacher', plural: 'Teachers', title: 'More teaching.<br>Less marking.',
      caption: 'A teacher’s review becomes a child’s next step.',
      description: 'From curriculum coverage to the next worksheet. Plan, assign and review in one teaching workspace, with topic-level evidence close at hand.',
      features: ['Syllabus-linked worksheets and quizzes', 'Drafts, submissions and teacher review', 'Topic-level insight for the next lesson'],
      routeTitle: 'Your judgement.<br><em>Time to teach.</em>',
      routeDescription: 'Sthara brings assignments, handwritten work and learning evidence into one teaching workflow. AI assists with the marking. The teacher stays responsible for the review.',
      steps: [
        ['Set the work', 'Create assignments with AI-assisted questions and connect the work to the class and subject.'],
        ['Review before confirming', 'Read the submission beside the suggested correction. Use your knowledge of the learner to confirm or change the assessment.'],
        ['Teach from the evidence', 'Bring teacher-confirmed homework together with quizzes and classroom work to identify concepts worth revisiting.']
      ],
      capture: 'The teacher’s grading-review screen, showing handwriting, the suggested mark and the teacher-confirmation control.'
    },
    admin: {
      name: 'Administrator', plural: 'Administrators', title: 'The whole school.<br>In clearer view.',
      caption: 'An office update reaches the people who need it.',
      description: 'Connect everyday school operations with the academic record. Attendance, fees, admissions and reporting belong in the same conversation.',
      features: ['Attendance, fees and admissions', 'Shared context across school teams', 'Admin-side AI on selected plans'],
      routeTitle: 'Run the school.<br><em>See it clearly.</em>',
      routeDescription: 'A school is more than a collection of registers. Sthara brings academic and administrative work together so your team can act with the same context.',
      steps: [
        ['Bring everyday operations together', 'Manage attendance, fees, admissions and reporting from the school’s operating layer.'],
        ['Connect the office and classroom', 'Read operational activity alongside the academic record instead of rebuilding context from disconnected files.'],
        ['Choose the right scale', 'Explore admin-side AI with Shikhara or a multi-campus rollout with Mandala. Confirm your requirements during the pilot discussion.']
      ],
      capture: 'The administrator overview with anonymised attendance, fee and academic information visible together.'
    },
    parent: {
      name: 'Parent', plural: 'Parents', title: 'Close to the day.<br>Clear on the next step.',
      caption: 'A school update becomes a useful conversation at home.',
      description: 'Help families understand what is happening at school through connected progress, reminders and WhatsApp communication.',
      features: ['Progress in a parent-friendly view', 'School updates through WhatsApp', 'The next step, not just the final mark'],
      routeTitle: 'Stay close.<br><em>Clarity at home.</em>',
      routeDescription: 'Families should not have to reconstruct a school day from scattered messages. Sthara connects the school record to a clearer parent experience.',
      steps: [
        ['See the work behind the mark', 'Bring progress and school updates together so parents have context for conversations at home.'],
        ['Receive relevant updates', 'Use the parent experience and WhatsApp communication to stay aware of school activity and reminders.'],
        ['Support the next step', 'Understand what a child is practising and how to support the next learning conversation.']
      ],
      capture: 'An anonymised parent progress screen or WhatsApp update, with names and phone numbers removed.'
    }
  };

  function moduleMarkup(role) {
    const top = (name) => `<div class="module-top"><span>${name}</span><span class="sample-label">Interactive example</span></div>`;
    if (role === 'student') return `${top('Try a tutor prompt')}<p>Solve for x:</p><p class="equation">3x + 6 = 21</p><p>What would you do first?</p><div class="mini-options"><button data-tutor="subtract">Subtract 6</button><button data-tutor="divide">Divide by 3</button></div><p class="module-response" id="tutor-response" aria-live="polite">Choose an approach to continue this sample conversation.</p><p class="module-note">Prewritten example, not a live AI tutor.</p>`;
    if (role === 'teacher') return `${top('The teacher decides')}<p>Linear equations / sample submission</p><p class="equation">x = 5</p><p>The method and final answer are correct.</p><div class="suggested-mark"><span>Suggested mark</span><b>3 / 3</b></div><button data-mini-confirm>Confirm sample review ↗</button><p class="module-response" id="mini-confirm-status" aria-live="polite">The suggestion waits for a teacher’s review.</p>`;
    if (role === 'admin') return `${top('Trace a school update')}<h4>Attendance has context.</h4><div class="record-row"><span>Class attendance</span><b>Recorded</b></div><div class="record-row"><span>Academic record</span><b>Connected</b></div><div class="record-row"><span>Parent communication</span><b>Review next</b></div><button class="text-link" data-admin-trace style="margin-top:18px">Follow the connection <span>↗</span></button><p class="module-response" id="admin-response" aria-live="polite">A conceptual view of how information can connect.</p>`;
    return `${top('A clearer update home')}<div class="message-sample"><p>Your child has reviewed linear equations with their teacher. The next practice focus is checking each step before submitting.</p></div><button class="text-link" data-parent-expand>What could we practise? <span>↗</span></button><p class="module-response" id="parent-response" aria-live="polite">Sample message. Nothing is sent.</p>`;
  }

  function selectRole(role) {
    if (!roles[role]) return;
    selectedRole = role;
    root.dataset.role = role;
    window.StharaHeroMotion?.setRole(role);
    const info = roles[role];
    $$('.role-node').forEach((button) => {
      const active = button.dataset.role === role;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('[data-line]').forEach((line) => line.classList.toggle('active', line.dataset.line === role));
    $('#orbit-caption').textContent = info.caption;
    $$('[data-explore]').forEach((tab) => {
      const active = tab.dataset.explore === role;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const panel = $('#role-panel');
    panel.setAttribute('aria-labelledby', `tab-${role}`);
    panel.innerHTML = `<div class="role-panel-inner"><div class="role-copy"><h3>${info.title}</h3><p>${info.description}</p><ul>${info.features.map((feature) => `<li>${feature}</li>`).join('')}</ul><a class="text-link" href="#/${role}">Explore for ${info.plural.toLowerCase()} <span>↗</span></a></div><div class="sample-module">${moduleMarkup(role)}</div></div>`;
    if (role === 'teacher' || role === 'student') $('.role-copy',panel).insertAdjacentHTML('beforeend', `<button class="role-evidence-link" data-open-capture="${role==='teacher'?'copilot':'tutor'}">Inspect the supplied ${role==='teacher'?'copilot':'tutor'} screen ↗</button>`);
  }

  function stopStory() {
    clearTimeout(storyTimer);
    storyPlaying = false;
    $('#story-play').innerHTML = 'Play the story <span>▷</span>';
  }
  function showStory(step, fromPlayback = false) {
    if (!fromPlayback) stopStory();
    storyStep = step;
    if (step === 0) storyConfirmed = false;
    $$('[data-step]').forEach((button) => {
      const active = Number(button.dataset.step) === step;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const content = $('#story-content');
    if (step === 0) {
      content.innerHTML = '<div class="notebook"><span class="paper-label">SAMPLE NOTEBOOK / GRADE 8</span><p>3x + 6 = 21</p><p>3x = 21 − 6 = 15</p><p>x = 5</p><small>Check: 3(5) + 6 = 21</small><span class="paper-corner">Ready to review ↗</span></div>';
    } else if (step === 1) {
      content.innerHTML = `<div class="review-work"><span class="sample-label">PREWRITTEN AI SUGGESTION</span><h3>Correct answer.<br>Reasoning worth recognising.</h3><p class="review-answer">3x = 15 &nbsp; → &nbsp; x = 5</p><p>The student subtracts 6 from both sides, divides by 3 and checks the answer. Suggested mark: <strong>3 / 3</strong>.</p><p class="review-hint">The record waits for a teacher’s decision.</p><button class="button" id="confirm-story">Confirm sample review <span>↗</span></button></div>`;
    } else if (!storyConfirmed) {
      content.innerHTML = '<div class="sync-story"><div class="sync-symbol">Ⅱ</div><h3>The teacher comes first.</h3><p>A suggested mark does not become a confirmed assessment on its own. Review the example before connecting the insight.</p><button class="button secondary" data-return-review style="margin-top:25px">Review the suggestion <span>↗</span></button></div>';
    } else {
      content.innerHTML = '<div class="sync-story"><div class="sync-symbol">✓</div><h3>A useful next step.<br>Not another isolated mark.</h3><p>The confirmed review becomes part of the learning record, ready to inform the next lesson and a conversation at home.</p><div class="sync-path"><div><b>Student</b><span>Feedback to practise</span></div><div><b>Teacher</b><span>Evidence for the lesson</span></div><div><b>Parent</b><span>Context for support</span></div></div><p class="story-complete">Sample review complete. No real record was changed.</p></div>';
    }
  }
  $('#story-play').addEventListener('click', () => {
    if (storyPlaying) return stopStory();
    if (paused) { showStory(storyStep === 0 ? 1 : 0); return; }
    storyPlaying = true;
    showStory(0, true);
    $('.notebook').insertAdjacentHTML('beforeend', '<span class="scan-line" aria-hidden="true"></span>');
    $('#story-play').innerHTML = 'Pause story <span>Ⅱ</span>';
    storyTimer = setTimeout(() => { showStory(1, true); stopStory(); }, 2500);
  });

  const topics = [
    { score: 76, status: 'Developing', evidence: ['Classwork: 72', 'Homework: 84', 'Quiz: 71'], title: 'The method is there. Check the transfer.', copy: 'The sample record is stronger on homework than in quizzes. A short classroom problem could test whether the method transfers without prompts.' },
    { score: 62, status: 'Needs practice', evidence: ['Classwork: 65', 'Homework: 68', 'Quiz: 54'], title: 'Revisit the concept before adding speed.', copy: 'The sample quiz suggests motion and force need another explanation. A worked example and a teacher check-in could be more useful than extra repetition.' },
    { score: 88, status: 'Strong', evidence: ['Classwork: 86', 'Homework: 91', 'Quiz: 87'], title: 'Strong across different kinds of work.', copy: 'The sample evidence is consistent. A more open-ended reading task could stretch the learner while the teacher continues checking understanding.' }
  ];
  // Local, illustrative evidence inspection. Source selection never recalculates TML.
  let selectedTopic = 0;
  const masteryPalette = (score) => score < 25 ? ['#ed174c','#b70d38'] : score < 40 ? ['#ff8846','#a6430c'] : score < 55 ? ['#f7b900','#856000'] : score < 75 ? ['#5bc69e','#157457'] : ['#0cba87','#087956'];
  function showMasteryValue(score, label, status) {
    const [colour, ink] = masteryPalette(score);
    const card = $('.mastery-console');
    card.style.setProperty('--tml-active', colour);
    card.style.setProperty('--tml-ink-light', ink);
    $('#mastery-score').textContent = score;
    $('#mastery-view').textContent = label;
    $('#mastery-status').textContent = status;
    $('.dial-value').style.strokeDashoffset = String(534 * (1 - score / 100));
  }
  function inspectEvidence(index) {
    const topic = topics[selectedTopic];
    const source = topic.evidence[index];
    const preview = source !== undefined;
    if (preview) {
      const [label, value] = source.split(': ');
      showMasteryValue(Number(value), label.toUpperCase(), 'Sample evidence / 100');
      $('#evidence-source-note').textContent = `${label}: ${value} / 100. Topic TML remains ${topic.score}; this view does not recalculate it.`;
    } else {
      showMasteryValue(topic.score, 'TOPIC TML', topic.status);
      $('#evidence-source-note').textContent = 'Select a source to inspect its score in the ring.';
    }
    $('#tml-return').disabled = !preview;
    $('#tml-return').textContent = preview ? 'Back to topic ↶' : 'Topic overview ↶';
    $$('[data-evidence]').forEach(button => button.setAttribute('aria-pressed', String(preview && Number(button.dataset.evidence) === index)));
  }
  function showTopic(index) {
    selectedTopic = index;
    const topic = topics[index];
    $('#evidence-chips').innerHTML = topic.evidence.map((evidence, i) => {
      const [label, value] = evidence.split(': ');
      const [colour, ink] = masteryPalette(Number(value));
      return `<button class="tml-evidence" data-evidence="${i}" aria-pressed="false" aria-label="Inspect ${label}, ${value} out of 100" style="--evidence-colour:${colour};--evidence-ink:${ink};--evidence-width:${value}%"><span>${label}<i aria-hidden="true">↗</i></span><strong>${value}<small>/100</small></strong><span class="tml-evidence-track" aria-hidden="true"><i></i></span></button>`;
    }).join('');
    inspectEvidence(-1);
    $('#evidence-title').textContent = topic.title;
    $('#evidence-copy').textContent = topic.copy;
    $$('[data-topic]').forEach((button) => { const active = Number(button.dataset.topic) === index; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); const [colour, ink] = masteryPalette(topics[Number(button.dataset.topic)].score); button.style.setProperty('--topic-colour', colour); button.style.setProperty('--topic-ink', ink); });
  }

  const tiers = [
    { name: 'Aadhara', price: 2000, detail: 'Core platform with standard tutor exchanges and fixed usage limits. No admin-side AI.' },
    { name: 'Sthamba', price: 2500, detail: 'Increased tutor exchanges and extendable usage on request. No admin-side AI.' },
    { name: 'Shikhara', price: 3500, detail: 'Full admin-side AI, higher usage limits, priority support and staff training.' },
    { name: 'Mandala', price: null, detail: 'School-group scope, cross-campus analytics and rollout support. Discuss volume pricing with Sthara.' }
  ];
  const rupees = (value) => `₹${Math.round(value).toLocaleString('en-IN')}`;
  function updateEstimate() {
    const students = Number($('#students').value);
    const tier = tiers[selectedTier];
    $('#student-count').textContent = students.toLocaleString('en-IN');
    $('#students').setAttribute('aria-valuetext', `${students.toLocaleString('en-IN')} students`);
    $('#estimate-label').textContent = tier.price ? `Annual estimate · ${tier.name}` : 'School groups & trusts';
    $('#annual-cost').textContent = tier.price ? rupees(students * tier.price) : 'Let’s scope it.';
    $('#monthly-cost').textContent = tier.price ? `${rupees(tier.price / 12)} per student / month equivalent` : 'A quotation shaped around your campuses.';
    $('#tier-detail').textContent = tier.detail;
    $('#students').disabled = !tier.price;
  }
  function selectTier(index) {
    selectedTier = index;
    $$('[data-tier]').forEach((button) => { const active = Number(button.dataset.tier) === index; button.classList.toggle('active', active); button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1; });
    updateEstimate();
  }
  $('#students').addEventListener('input', updateEstimate);

  const mega = $('#mega-menu');
  const megaTrigger = $('.menu-trigger');
  const mobileNav = $('#mobile-nav');
  const mobileTrigger = $('.mobile-toggle');
  function closeMenus() { mega.hidden = true; megaTrigger.setAttribute('aria-expanded', 'false'); mobileNav.hidden = true; mobileTrigger.setAttribute('aria-expanded', 'false'); mobileTrigger.setAttribute('aria-label', 'Open navigation'); }
  megaTrigger.addEventListener('click', () => { const open = mega.hidden; closeMenus(); mega.hidden = !open; megaTrigger.setAttribute('aria-expanded', String(open)); });
  mobileTrigger.addEventListener('click', () => { const open = mobileNav.hidden; closeMenus(); mobileNav.hidden = !open; mobileTrigger.setAttribute('aria-expanded', String(open)); mobileTrigger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (!target.closest('.site-header')) closeMenus();
    if (target.closest('.site-header a')) closeMenus();
    const role = target.closest('.role-node[data-role]');
    if (role) selectRole(role.dataset.role);
    const explorer = target.closest('[data-explore]');
    if (explorer) selectRole(explorer.dataset.explore);
    const tutor = target.closest('[data-tutor]');
    if (tutor) {
      const subtract = tutor.dataset.tutor === 'subtract';
      $('#tutor-response').textContent = subtract ? 'Exactly. Subtract 6 from both sides: 3x = 15. What will you divide by to leave x on its own?' : 'That can work too. Divide every term by 3: x + 2 = 7. What would you subtract next?';
      $$('[data-tutor]').forEach((button) => button.classList.toggle('chosen', button === tutor));
    }
    if (target.closest('[data-mini-confirm]')) {
      const button = target.closest('[data-mini-confirm]');
      button.textContent = 'Sample review confirmed ✓'; button.disabled = true;
      $('#mini-confirm-status').textContent = 'The example now has a teacher-confirmed mark. No real student record was changed.';
      $('#mini-confirm-status').classList.add('module-success');
    }
    if (target.closest('[data-admin-trace]')) $('#admin-response').textContent = 'Recorded attendance → learning context → a reviewed parent update. Each role sees the part relevant to its responsibility. Illustrative only.';
    if (target.closest('[data-parent-expand]')) $('#parent-response').textContent = 'Try 2x + 4 = 14 together. Ask your child to explain each step and check the answer. This is a prewritten example, not personalised advice.';
    const step = target.closest('[data-step]');
    if (step) showStory(Number(step.dataset.step));
    if (target.closest('#confirm-story')) { storyConfirmed = true; showStory(2); }
    if (target.closest('[data-return-review]')) showStory(1);
    const topic = target.closest('[data-topic]');
    if (topic) showTopic(Number(topic.dataset.topic));
    const evidence = target.closest('[data-evidence]');
    if (evidence) inspectEvidence(Number(evidence.dataset.evidence));
    if (target.closest('#tml-return')) inspectEvidence(-1);
    const tier = target.closest('[data-tier]');
    if (tier) selectTier(Number(tier.dataset.tier));
    if (target.closest('[data-add-capture]')) { $('#capture-role').value = target.closest('[data-add-capture]').dataset.addCapture; $('#review-dialog').showModal(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!mega.hidden) { closeMenus(); megaTrigger.focus(); }
      else if (!mobileNav.hidden) { closeMenus(); mobileTrigger.focus(); }
    }
    const target = event.target;
    let buttons, index, activate;
    if (target.matches('[data-explore]')) { buttons = $$('[data-explore]'); activate = (button) => selectRole(button.dataset.explore); }
    if (target.matches('[data-tier]')) { buttons = $$('[data-tier]'); activate = (button) => selectTier(Number(button.dataset.tier)); }
    if (!buttons || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    index = buttons.indexOf(target);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else index = (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    activate(buttons[index]); buttons[index].focus();
  });

  function renderRoute(shouldFocus = false) {
    const role = location.hash.startsWith('#/') ? location.hash.slice(2).split('#')[0] : root.dataset.page;
    const info = roles[role];
    const rolePage = $('#role-page');
    const companyPage = $('#company-page');
    const isCompany = companyPage && root.dataset.page !== 'home' && !roles[root.dataset.page];
    $('#home-page').hidden = Boolean(info || isCompany);
    rolePage.hidden = !info;
    if (companyPage) companyPage.hidden = !isCompany;
    closeMenus();
    if (isCompany) {
      stopStory();
      $('#role-panel').innerHTML = '';
      rolePage.innerHTML = '';
      document.title = companyPage.dataset.title || root.dataset.title || originalTitle;
      let anchor = location.hash.startsWith('#/') ? location.hash.split('#')[2] : location.hash.slice(1);
      try { anchor = decodeURIComponent(anchor || ''); } catch { anchor = ''; }
      if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: paused ? 'instant' : 'smooth' }));
      else if (shouldFocus) { companyPage.querySelector('h1')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
      return;
    }
    if (info) {
      stopStory();
      // Remove the hidden homepage module, avoiding duplicate IDs and hidden control targets.
      $('#role-panel').innerHTML = '';
      const supplied = role === 'teacher' ? ['copilot','class-mastery','curriculum'] : role === 'student' ? ['tutor','mastery','evidence'] : [];
      const captureMarkup = captures[role]
        ? `<img src="${captures[role]}" alt="Locally supplied anonymised ${info.name.toLowerCase()} product screenshot"><figcaption>Locally supplied product capture. Visible only in this browser session.</figcaption>`
        : supplied.length ? supplied.map(id => {const item=window.StharaCaptures.get(id);return `<button class="role-screen" data-open-capture="${id}"><img src="${item.src}" alt="Supplied ${item.label.toLowerCase()} design capture" loading="lazy"><span>${item.label}<b>Inspect ↗</b></span><small>${item.title}</small></button>`;}).join('')+'<figcaption>Supplied design captures. Example values, not live student records.</figcaption>'
        : `<div class="capture-placeholder"><svg class="exact-brand" viewBox="0 0 196 316" aria-hidden="true"><use href="#pillar-logo"/></svg><strong>See your school's workflow.</strong><p>Explore the ${info.name.toLowerCase()} experience with the Sthara team during a pilot discussion.</p><a class="text-link" href="/contact">Talk to the team <span>↗</span></a></div><figcaption>No identifiable student or family records are displayed here.</figcaption>`;
      rolePage.innerHTML = `<div class="wrap"><section class="role-page-hero"><a class="back-link" href="#platform">← Back to the platform</a><div class="eyebrow">FOR ${info.plural.toUpperCase()}</div><h1 tabindex="-1">${info.routeTitle}</h1><p>${info.routeDescription}</p><a class="button" href="#contact">Book a pilot <span>↗</span></a></section><section class="role-detail-layout"><div class="role-detail-steps"><h2>A day with Sthara.</h2>${info.steps.map(([title, copy]) => `<article><h3>${title}</h3><p>${copy}</p></article>`).join('')}<div class="sample-module">${moduleMarkup(role)}</div></div><figure class="role-capture">${captureMarkup}</figure></section><nav class="role-related" aria-label="Other school roles"><span>One record connects everyone.</span>${Object.entries(roles).filter(([key]) => key !== role).map(([key, data]) => `<a href="#/${key}">${data.plural} ↗</a>`).join('')}</nav></div>`;
      document.title = `Sthara for ${info.plural} | The Unified School OS`;
      if (shouldFocus) { $('#role-page h1').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
    } else {
      rolePage.innerHTML = '';
      if (!$('#role-panel').children.length) selectRole(selectedRole);
      setTitle();
      const id = location.hash.slice(1);
      const destination = id && document.getElementById(id);
      if (destination && shouldFocus) requestAnimationFrame(() => destination.scrollIntoView({ behavior: paused ? 'instant' : 'smooth' }));
    }
  }
  window.addEventListener('hashchange', () => renderRoute(true));
  const dialog = $('#review-dialog');
  if (dialog) {
  $('#review-open').addEventListener('click', () => dialog.showModal());
  $('#review-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); });
  $('#capture-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = $('#capture-status');
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) { status.textContent = 'Choose a PNG, JPEG or WebP image smaller than 12 MB.'; event.target.value = ''; return; }
    const role = $('#capture-role').value;
    const url = URL.createObjectURL(file);
    objectUrls.add(url);
    const probe = new Image();
    probe.onload = () => {
      if (captures[role]) { URL.revokeObjectURL(captures[role]); objectUrls.delete(captures[role]); }
      captures[role] = url;
      status.textContent = `Screenshot ready for the ${roles[role].name.toLowerCase()} page. Close this panel to view it. It is not uploaded.`;
      if (location.hash === `#/${role}`) renderRoute(false); else location.hash = `/${role}`;
    };
    probe.onerror = () => { URL.revokeObjectURL(url); objectUrls.delete(url); status.textContent = 'This file could not be decoded as an image. Please choose another capture.'; };
    probe.src = url;
  });
  }

  function setTitle() { document.title = root.dataset.standalone ? 'Sthara | The Unified School OS' : originalTitle; }
  let color = [116,172,255];
  function setTheme(theme) {
    root.dataset.theme = theme;
    try { sessionStorage.setItem('sthara-theme', theme); } catch {}
    $$('[data-dark][data-light]').forEach((element) => element.textContent = element.dataset[theme]);
    $('.theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Switch to daylight design' : 'Switch to constellation design');
    $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#08121e' : '#faf7f2');
    color = theme === 'dark' ? [116,172,255] : [178,94,111];
    window.StharaHeroMotion?.setTheme(theme);
    setTitle();
    drawAtmosphere(performance.now(), false);
  }
  $('.theme-toggle').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

  // A single lightweight, time-based canvas loop; no React/state rerenders or scroll listener.
  const canvas = $('#atmosphere');
  const context = canvas.getContext('2d');
  const light = $('.pointer-light');
  const pointer = { x: -1000, y: -1000, sx: -1000, sy: -1000, active: false };
  let width = 0, height = 0, points = [], frame = null, previousTime = 0;
  function sizeAtmosphere() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = width < 768 ? 29 : 62;
    points = Array.from({length:count}, (_,i) => ({x: (i * .61803398875 % 1) * width, y: (i * .75487766625 % 1) * height, vx: Math.sin(i * 7.3) * 4, vy: Math.cos(i * 3.2) * 4, r: i % 5 === 0 ? 1.5 : .85, gold: i % 9 === 0}));
    drawAtmosphere(performance.now(), false);
  }
  function drawAtmosphere(now, move = true) {
    if (!context || !width) return;
    const delta = Math.min((now - previousTime) / 1000 || 0, .05);
    if (move) previousTime = now;
    context.clearRect(0,0,width,height);
    if (pointer.active && move) {
      const spring = 1 - Math.exp(-12 * delta);
      pointer.sx += (pointer.x - pointer.sx) * spring; pointer.sy += (pointer.y - pointer.sy) * spring;
      light.style.transform = `translate3d(${pointer.sx}px,${pointer.sy}px,0)`;
    }
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (move) { point.x += point.vx * delta; point.y += point.vy * delta; if (point.x < 0) point.x = width; if (point.x > width) point.x = 0; if (point.y < 0) point.y = height; if (point.y > height) point.y = 0; }
      const rgb = point.gold ? (root.dataset.theme === 'dark' ? [210,179,115] : [143,99,52]) : color;
      context.beginPath(); context.fillStyle = `rgba(${rgb.join(',')},.65)`; context.arc(point.x,point.y,point.r,0,Math.PI*2); context.fill();
      for (let j = i + 1; j < points.length; j++) {
        const other = points[j]; const distance = Math.hypot(point.x-other.x,point.y-other.y);
        if (distance < 130) { context.beginPath(); context.strokeStyle = `rgba(${color.join(',')},${.13*(1-distance/130)})`; context.lineWidth=.6; context.moveTo(point.x,point.y); context.lineTo(other.x,other.y); context.stroke(); }
      }
      if (pointer.active && !paused) {
        const distance = Math.hypot(point.x-pointer.sx,point.y-pointer.sy);
        if (distance < 155) { context.beginPath(); context.strokeStyle=`rgba(${color.join(',')},${.33*(1-distance/155)})`; context.lineWidth=.8; context.moveTo(point.x,point.y); context.lineTo(pointer.sx,pointer.sy); context.stroke(); }
      }
    }
  }
  function animate(now) {
    frame = null;
    if (paused || document.hidden) return;
    if (now - previousTime >= 1000/30) drawAtmosphere(now);
    frame = requestAnimationFrame(animate);
  }
  function syncMotion() {
    window.StharaHeroMotion?.setPaused(paused);
    document.body.classList.toggle('motion-paused', paused);
    $('#motion-toggle').setAttribute('aria-pressed', String(paused));
    $('#motion-toggle').textContent = paused ? 'Resume motion ▷' : 'Pause motion Ⅱ';
    if (frame) { cancelAnimationFrame(frame); frame = null; }
    if (!paused && !document.hidden) { previousTime = performance.now(); frame = requestAnimationFrame(animate); }
    else { stopStory(); drawAtmosphere(performance.now(), false); }
  }
  $('#motion-toggle').addEventListener('click', () => { paused = !paused; syncMotion(); });
  reducedQuery.addEventListener('change', (event) => { paused = event.matches; syncMotion(); });
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('tab-inactive', document.hidden); syncMotion(); if (document.hidden) stopStory(); });
  document.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || paused || event.pointerType === 'touch') return;
    if (!pointer.active) { pointer.sx = event.clientX; pointer.sy = event.clientY; }
    pointer.active = true; pointer.x = event.clientX; pointer.y = event.clientY;
    document.body.classList.add('pointer-active');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; document.body.classList.remove('pointer-active'); });
  window.addEventListener('resize', sizeAtmosphere, { passive: true });

  selectRole('teacher'); showStory(0); showTopic(0); selectTier(2);
  let savedTheme;
  try { savedTheme = sessionStorage.getItem('sthara-theme'); } catch {}
  sizeAtmosphere(); setTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : root.dataset.theme === 'light' ? 'light' : 'dark');
  syncMotion(); renderRoute();
  $('[data-year]').textContent = new Date().getFullYear();
  if ('IntersectionObserver' in window) {
    root.classList.add('js-ready');
    const reveals = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('in'); reveals.unobserve(entry.target); } }), { threshold:.07 });
    $$('.reveal').forEach((element) => reveals.observe(element));
    const heroVisibility = new IntersectionObserver(([entry]) => document.body.classList.toggle('hero-offscreen', !entry.isIntersecting));
    heroVisibility.observe($('.hero'));
  }
  window.addEventListener('pagehide', () => { if (frame) cancelAnimationFrame(frame); stopStory(); });
  window.addEventListener('pageshow', (event) => { if (event.persisted) syncMotion(); });
})();
