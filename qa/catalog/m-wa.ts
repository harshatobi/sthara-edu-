import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P14', priority: 'Critical', text: 'Linking a number: a 6-digit code on WhatsApp (valid 10 minutes) proves it, then the person opts in; one number belongs to one account; unlink and pause at any time; at most 5 link attempts in 15 minutes. While the channel is simulated, messages are logged, not delivered, and the code is shown on screen (“Test mode”).', api: 'POST/DELETE /api/parent/whatsapp, /api/staff/whatsapp', tables: 'whatsapp_links, whatsapp_log', auto: [`${A.wa}with no real Cloud API credentials the channel is simulated (nothing is sent)`, `${A.wa}Indian mobile numbers get +91; others must be written in full`] },
  { n: '02', process: 'P14', priority: 'Critical', text: 'Webhook security: Meta’s verify token for the subscription, and an exact X-Hub-Signature-256 over the raw body for every delivery; anything else is refused.', api: 'GET/POST /api/whatsapp/webhook', auto: [`${A.wa}webhook deliveries need the exact Meta signature over the raw body`, `${A.pub}the WhatsApp webhook refuses a wrong verify token`, `${A.pub}the WhatsApp webhook refuses deliveries without a valid Meta signature`] },
  { n: '03', process: 'P14', priority: 'High', text: 'Parent commands: STOP / START / HELP, SEND (the drafted message), a number to pick an option; anything else is a question for the School OS.', auto: [`${A.parent}WhatsApp text: numbered options and SEND prompt`] },
  { n: '04', process: 'P14', priority: 'High', text: 'Staff commands: TODAY (digest), ACK, SEND, R <text> (reply to a parent), a register by roll number ("ABSENT 4, 12 LATE 7", "ALL PRESENT"), ABSENT/SICK [AM|PM] for themselves; staff with no login: IN, OUT, LEAVE with dates.', auto: [`${A.staff}staff commands`, `${A.staff}register references: roll number, position, unique first name`, `${A.att}WhatsApp words: IN, OUT, LEAVE with dates`] },
  { n: '05', process: 'P14', priority: 'Medium', text: 'The daily digest greets by IST time of day, is sent at most once a day unless asked (TODAY), and skips registers on Sundays.', auto: [`${A.staff}staff ask protocol: tokens, targets, WhatsApp text`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Link a number and use the test chat', role: 'Parent', priority: 'Critical', type: 'Positive', req: ['01', '03'], uat: true,
    pre: 'Channel simulated (Test mode).', data: '98765 43210',
    steps: [
      ['WhatsApp & Privacy: enter the number; tick the consent; send the code.', '"Test mode code: ######" shows (nothing is delivered).'],
      ['Enter a wrong code, then the right one.', 'Wrong: refused. Right: "Linked to +91 98xxxxx210".'],
      ['Test chat: type HELP.', 'The list of commands.'],
      ['Ask a question; reply with an option number; SEND.', 'The answer with numbered options; the chosen draft is sent to the school.'],
      ['STOP; then START.', 'Paused; then resumed.'],
    ] },
  { n: '02', title: 'Teacher takes the register on WhatsApp', role: 'Teacher', priority: 'High', type: 'Positive', req: ['04', '05'], uat: true,
    pre: 'Teacher linked; class teacher of 10-A.', data: '"ABSENT 4, 12 LATE 7"',
    steps: [
      ['Send TODAY.', 'The day’s digest (lessons, covers, register due).'],
      ['Send "ABSENT 4, 12 LATE 7".', 'Confirmation naming the students; everyone else present; the web register shows the same.'],
      ['Send "ABSENT 4, 99".', 'Nothing saved; 99 is reported as unmatched.'],
      ['Send "absent today".', 'Treated as a question to the School OS, not a register.'],
      ['Send "SICK AM".', 'The office sees the teacher reported absent for the morning (Cover board, reported on WhatsApp).'],
    ] },
  { n: '03', title: 'Driver checks in and asks for leave', role: 'Register staff (no login)', priority: 'Medium', type: 'Positive', req: ['04'],
    pre: 'A driver on the register with WhatsApp consent.',
    steps: [
      ['Send IN; later OUT.', 'Both recorded on the attendance board (source WhatsApp).'],
      ['Send "LEAVE 12 Oct to 14 Oct sister’s wedding".', 'A leave request for HR to approve.'],
    ] },
];
