(() => {
  'use strict';
  const rows = [
    ['curriculum','Curriculum','Teach with a map, not a checklist.','Separate what has been taught from what has been assessed. The curriculum view puts the next assignment beside the topic that needs evidence.','teacher'],
    ['assignments','Assignments','From a draft to the whole class.','Posted work, submission progress and unpublished drafts share one assignment manager. Each task keeps its subject, questions and due date in view.','teacher'],
    ['quizzes','Quiz creation','Three ways to begin. One teaching intent.','Start with AI-assisted questions, write a quiz yourself or bring an existing worksheet. The teacher chooses the starting point.','teacher'],
    ['copilot','Teacher copilot','A thought partner for the next lesson.','A syllabus-linked workspace for worksheets, lesson plans and remedial material, with controls to copy, export or send work to the class.','teacher'],
    ['class-mastery','Class mastery','A class is more than its average.','Move through chapters to see where scored evidence exists. Topic-level views help teachers decide where a closer look could be useful.','teacher'],
    ['mastery','Student mastery','A score with its working shown.','The student view lays out what feeds the score: homework and quizzes at 40% each and tutor depth at 20%, with the evidence behind every topic.','student'],
    ['evidence','Evidence trail','Follow the learning back to the work.','The visual evidence trail connects assignments and quizzes to topics. Ungraded work stays visibly different from scored evidence.','student'],
    ['tutor','Socratic tutor','The next question, not a shortcut.','A tutor session opens with a question about the learner’s reasoning. Hints and a step-by-step conversation give the learning process room to unfold.','student'],
    ['wellness','Student wellbeing','Make space for the person learning.','The wellbeing design brings an energy check-in, an optional journal and a visibility guide together. The controls shown here are not verification of privacy enforcement.','student']
  ];
  const items = rows.map(([id,label,title,description,role]) => ({id,label,title,description,role,src:window.STHARA_CAPTURE_IMAGES?.[id] || `assets/captures/${id}.png`}));
  let active = 0, modalIndex = 0, returnTo;
  const host = document.getElementById('capture-gallery');
  const modal = document.createElement('dialog');
  modal.className = 'capture-dialog';
  modal.setAttribute('aria-labelledby','capture-dialog-title');
  modal.innerHTML = '<div class="dialog-head"><h2 id="capture-dialog-title"></h2><button aria-label="Close product capture" data-capture-close>×</button></div><img alt=""><div class="capture-dialog-bottom"><button data-capture-prev>← Previous</button><p>Supplied design capture. Example values, not live records.</p><button data-capture-next>Next →</button></div>';
  document.body.append(modal);
  host.innerHTML = `<div class="capture-layout"><div class="capture-nav" role="tablist" aria-label="Product screens">${items.map((v,i)=>`<button id="capture-tab-${v.id}" role="tab" aria-controls="capture-view" data-capture-select="${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span>${String(i+1).padStart(2,'0')}</span>${v.label}</button>`).join('')}</div><div class="capture-view" id="capture-view" role="tabpanel" tabindex="0"></div></div>`;
  function select(index) {
    active = index;
    const item = items[index], view = document.getElementById('capture-view');
    host.querySelectorAll('[data-capture-select]').forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    view.setAttribute('aria-labelledby',`capture-tab-${item.id}`);
    view.innerHTML = `<div class="capture-toolbar"><span>${item.role==='teacher'?'TEACHING COPILOT':'THE STUDENT EXPERIENCE'}</span><button class="capture-enlarge" data-open-capture="${item.id}">Inspect screen ↗</button></div><button class="capture-image-button" data-open-capture="${item.id}" aria-label="Enlarge ${item.label} design capture"><img src="${item.src}" alt="Supplied Sthara ${item.label.toLowerCase()} design screen" decoding="async"></button><div class="capture-caption"><div><h3>${item.title}</h3><p>${item.description}</p></div><span class="capture-count">${String(index+1).padStart(2,'0')} / 09</span></div>`;
  }
  function showModal(index) {
    modalIndex = (index + items.length) % items.length;
    const item = items[modalIndex];
    modal.querySelector('h2').textContent = item.label;
    const img = modal.querySelector('img');
    img.src = item.src; img.alt = `Supplied Sthara ${item.label.toLowerCase()} design screen`;
    if (!modal.open) { returnTo=document.activeElement; modal.showModal(); }
  }
  document.addEventListener('click', event => {
    const target=event.target instanceof Element?event.target:null;
    if (!target) return;
    const tab=target.closest('[data-capture-select]'); if(tab) select(Number(tab.dataset.captureSelect));
    const open=target.closest('[data-open-capture]'); if(open){const i=items.findIndex(v=>v.id===open.dataset.openCapture);if(i>=0)showModal(i);}
    if(target.closest('[data-capture-close]'))modal.close();
    if(target.closest('[data-capture-prev]'))showModal(modalIndex-1);
    if(target.closest('[data-capture-next]'))showModal(modalIndex+1);
  });
  host.addEventListener('keydown', event=>{
    if(!event.target.matches('[data-capture-select]'))return;
    const keys=['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'];
    if(!keys.includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(active+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    select(next);host.querySelector(`[data-capture-select="${next}"]`).focus();
  });
  modal.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();showModal(modalIndex+(event.key==='ArrowRight'?1:-1));}});
  modal.addEventListener('close',()=>{if(returnTo?.isConnected)returnTo.focus({preventScroll:true});});
  modal.addEventListener('click',event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();});
  window.StharaCaptures={get:id=>items.find(v=>v.id===id),open:id=>{const i=items.findIndex(v=>v.id===id);if(i>=0)showModal(i);}};
  select(0);
})();
