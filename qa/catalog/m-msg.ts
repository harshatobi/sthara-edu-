import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P11', priority: 'Critical', text: 'Parents start conversations with a teacher of their child or with the school office; teachers see their own conversations; office conversations reach holders of messages.office; replies show to the parent straight away.', api: 'GET/POST /api/parent/messages, /api/staff/messages', tables: 'conversations, messages', auto: [`${A.j02}1. Parent sends a message to the school office`, `${A.j02}2. The office finds it in Parent Messages and replies`, `${A.j02}3. The parent sees the reply in the same conversation`] },
  { n: '02', process: 'P11', priority: 'High', text: 'An office account without messages.office is refused ("Your office role doesn’t include parent messages").', perm: 'messages.office' },
  { n: '03', process: 'P11', priority: 'Medium', text: 'Messages sent from WhatsApp are marked as such; a parent can link another child’s teacher only for their own verified children.', auto: [`${A.parent}parseAskReply resolves message targets and drops unknown ones`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Parent to office and back (end to end)', role: 'Parent, Counsellor', priority: 'Critical', type: 'Positive', req: ['01'], uat: true,
    pre: 'A parent linked to a student; an office account with messages.office.', data: 'Subject "Bus timing", a two-line message',
    auto: [`${A.j02}1. Parent sends a message to the school office`, `${A.j02}2. The office finds it in Parent Messages and replies`, `${A.j02}3. The parent sees the reply in the same conversation`],
    steps: [
      ['Parent: School Messages › New message; To: School office; SUBJECT, MESSAGE; Send.', 'The conversation opens with the message.'],
      ['Office: Parent Messages.', 'The conversation is at the top, marked unread, tagged Office.'],
      ['Office: open it; Reply.', '"Parents see your reply straight away."'],
      ['Parent: refresh School Messages.', 'The reply shows under the message; "Seen by the school".'],
    ] },
  { n: '02', title: 'Parent to class teacher', role: 'Parent, Teacher', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'The student’s class teacher has a login.',
    steps: [
      ['Parent: New message › To: the class teacher; send.', 'Sent.'],
      ['Teacher: Parent Messages.', 'Listed; another teacher of a different class does not see it.'],
      ['Teacher replies.', 'Parent sees it.'],
    ] },
  { n: '03', title: 'Office roles without parent messages', role: 'Cashier', priority: 'High', type: 'Security', req: ['02'],
    pre: 'A cashier-only account.',
    steps: [
      ['Look for Parent Messages in the menu.', 'Not there.'],
      ['Open /admin/messages.', '"Messages didn’t load" with "Your office role doesn’t include parent messages."'],
    ] },
];
