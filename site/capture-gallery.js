(() => {
  'use strict';
  const rows = [
    ['tutor','Socratic tutor','The next question, not a shortcut.','The tutor starts from the topics where the student will gain most, and asks before it answers.','student'],
    ['mastery','Student mastery','A score with its working shown.','Homework and quizzes count 40% each and tutor depth 20%, with every piece of evidence listed.','student'],
    ['copilot','Teacher Copilot','A Copilot that knows your class.','Worksheets, quizzes, lesson plans and board-pattern papers from the syllabus and the class’s real results.','teacher'],
    ['assignments','Homework','From a draft to the whole class.','Posted work, submissions and marking in one place for each class.','teacher'],
    ['class-mastery','Class heat map','A class is more than its average.','Chapter by chapter, see where the whole class stands and who needs a closer look.','teacher'],
    ['lab-predict','Live Lab: predict','The class predicts.','A simulation on the projector, a question for the class and the hands counted for each answer.','teacher'],
    ['lab-reveal','Live Lab: reveal','Run it and reveal.','The engine draws the real result, shows how many got it right and works the formula.','teacher'],
    ['lab-practical','CBSE practical','The official practical, ready for the board.','Apparatus, procedure, precautions, readings, viva and the practical record for every student.','teacher'],
    ['lab-gallery','Simulation library','Simulations for the class.','Physics, chemistry and biology simulations, each tied to its chapter and its prediction questions.','teacher'],
    ['parent-home','Parent home','Know how your child is doing, in one place.','Mastery, schoolwork, wellbeing and fees, with questions answered from the school’s own records.','parent'],
    ['parent-mastery','Parent mastery report','Progress you can read without waiting for a report card.','Subject-level mastery with the teacher’s name beside it, and an Explain this report option.','parent'],
    ['command-centre','Command centre','The whole school, in one view.','School-wide mastery, fee collection and CBSE wellness filing beside enrolment, staffing and the decisions waiting.','admin'],
    ['academic-health','Academic health','See where the school is weak before term-end results.','Every grade and subject on one screen, with how sure each number is.','admin'],
    ['admissions','Admissions','Every applicant, every stage.','Enquiries to enrolment, with follow-ups, seats by grade and the funnel.','admin'],
    ['fees','Fee ledger','Fees, collected and owed.','Billed, collected and outstanding, fee structure by grade, the counter and the day book.','admin'],
    ['attendance','Attendance','Every register in one place.','Who has marked today, each class’s month and session, and the students under the CBSE 75%.','admin']
  ];
  const items = rows.map(([id,label,title,description,role]) => ({id,label,title,description,role,src:window.STHARA_CAPTURE_IMAGES?.[id] || `assets/captures/${id}.jpg`}));
  let active = 0, modalIndex = 0, returnTo;
  const host = document.getElementById('capture-gallery');
  const modal = document.createElement('dialog');
  modal.className = 'capture-dialog';
  modal.setAttribute('aria-labelledby','capture-dialog-title');
  modal.innerHTML = '<div class="dialog-head"><h2 id="capture-dialog-title"></h2><button aria-label="Close screen" data-capture-close>×</button></div><img alt=""><div class="capture-dialog-bottom"><button data-capture-prev>← Previous</button><p>Sample school data.</p><button data-capture-next>Next →</button></div>';
  document.body.append(modal);
  if (host) host.innerHTML = `<div class="capture-layout"><div class="capture-nav" role="tablist" aria-label="Product screens">${items.map((v,i)=>`<button id="capture-tab-${v.id}" role="tab" aria-controls="capture-view" data-capture-select="${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span>${String(i+1).padStart(2,'0')}</span>${v.label}</button>`).join('')}</div><div class="capture-view" id="capture-view" role="tabpanel" tabindex="0"></div></div>`;
  function select(index) {
    active = index;
    const item = items[index], view = document.getElementById('capture-view');
    host.querySelectorAll('[data-capture-select]').forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    view.setAttribute('aria-labelledby',`capture-tab-${item.id}`);
    view.innerHTML = `<div class="capture-toolbar"><span>${({teacher:'TEACHING COPILOT',student:'THE STUDENT EXPERIENCE',admin:'THE COMMAND CENTRE',parent:'THE PARENT PORTAL'})[item.role]}</span><button class="capture-enlarge" data-open-capture="${item.id}">Inspect screen ↗</button></div><button class="capture-image-button" data-open-capture="${item.id}" aria-label="Enlarge the ${item.label} screen"><img src="${item.src}" alt="Sthara ${item.label.toLowerCase()} screen, sample school data" decoding="async"></button><div class="capture-caption"><div><h3>${item.title}</h3><p>${item.description}</p></div><span class="capture-count">${String(index+1).padStart(2,'0')} / ${String(items.length).padStart(2,'0')}</span></div>`;
  }
  function showModal(index) {
    modalIndex = (index + items.length) % items.length;
    const item = items[modalIndex];
    modal.querySelector('h2').textContent = item.label;
    const img = modal.querySelector('img');
    img.src = item.src; img.alt = `Sthara ${item.label.toLowerCase()} screen, sample school data`;
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
  host?.addEventListener('keydown', event=>{
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
  if (host) select(0);
})();
