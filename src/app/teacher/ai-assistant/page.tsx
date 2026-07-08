'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ArrowLeft, Send, Loader2, BrainCircuit, Download,
  CheckCircle, Copy, Zap, ClipboardList, FileText, Users,
  BarChart2, BookOpen, Clock, Calendar, Star, X, ChevronRight,
  Layers, GraduationCap, Settings, Heart, Activity, PenTool,
  Eye, RefreshCw, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/* ─── Types ─── */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  generatedData?: any;  // parsed JSON if AI generated content
  actions?: ChatAction[];
}

interface ChatAction {
  label: string;
  icon: string;
  value: string;
}

/* ─── Quick action chips shown in empty state ─── */
const QUICK_ACTIONS = [
  { label: 'Create a Quiz', icon: '⚡', prompt: 'I want to create a quiz' },
  { label: 'Make an Assignment', icon: '📋', prompt: 'Create a homework assignment for my class' },
  { label: 'Question Paper', icon: '📄', prompt: 'Generate a full question paper for an exam' },
  { label: 'Lesson Plan', icon: '📚', prompt: 'Help me create a lesson plan' },
  { label: 'Grading Rubric', icon: '✅', prompt: 'Make a grading rubric' },
  { label: 'Go to Grading', icon: '🔬', prompt: 'Take me to the grading gallery' },
  { label: 'View Heatmap', icon: '🗺️', prompt: 'I want to see the class performance heatmap' },
  { label: 'Student Wellness', icon: '❤️', prompt: 'Open the wellness tracker' },
];

/* ─── App navigation links ─── */
const NAV_LINKS: Record<string, string> = {
  'grading': '/teacher/grading',
  'grade': '/teacher/grading',
  'heatmap': '/teacher/heatmap',
  'quiz': '/teacher/quiz',
  'syllabus': '/teacher/syllabus',
  'mastery': '/teacher/mastery',
  'feed': '/teacher/feed',
  'wellness': '/teacher/wellness',
  'dashboard': '/teacher',
  'home': '/teacher',
  'ai-assistant': '/teacher/ai-assistant',
};

/* ─── Parse generated JSON from AI response ─── */
function parseGeneratedContent(text: string): any | null {
  try {
    const m = text.match(/```json\n([\s\S]*?)\n```/);
    if (!m?.[1]) return null;
    return JSON.parse(m[1]);
  } catch { return null; }
}

/* ─── Detect navigation intent ─── */
function detectNavIntent(text: string): string | null {
  // Only detect nav intent on SHORT explicit navigation responses
  // Avoid triggering on welcome messages or long explanations that mention these words
  const displayContent = text.replace(/```json[\s\S]*?```/g, '').trim();
  if (displayContent.length > 200) return null; // too long to be a nav response

  const lower = displayContent.toLowerCase();
  // Must contain explicit navigation verbs
  const hasNavVerb = /\b(open|go to|navigate|take you|opening|heading|directing|here is the link|click here)\b/i.test(lower);
  if (!hasNavVerb) return null;

  for (const [key, path] of Object.entries(NAV_LINKS)) {
    if (lower.includes(key)) return path;
  }
  return null;
}

/* ─── Publish Modal ─── */
function PublishModal({
  profile,
  data,
  onClose,
  onPublished,
}: {
  profile: any;
  data: any;
  onClose: () => void;
  onPublished: (id: string) => void;
}) {
  const teacherClasses: string[] = Array.from(new Set(
    (profile.assignments || []).map((a: any) => a.class).filter(Boolean)
  ));
  const type = data.generationType || (data.isInteractiveQuiz ? 'quiz' : data.isAssignment ? 'assignment' : 'paper');

  const [targetClass, setTargetClass] = useState(teacherClasses[0] || data.targetClass || '');
  const [customClass, setCustomClass] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [timeLimit, setTimeLimit] = useState(data.timeLimit || 20);
  const [publishing, setPublishing] = useState(false);

  const effectiveClass = teacherClasses.length > 0 ? targetClass : customClass;

  const handlePublish = async () => {
    const cls = effectiveClass.trim();
    if (!cls) { alert('Please select or enter a target class.'); return; }
    setPublishing(true);
    try {
      let docData: any = {};
      if (type === 'quiz') {
        docData = {
          title: data.title,
          subject: data.subject || 'General',
          targetClass: cls, class: cls,
          type: 'quiz',
          dueDate,
          timeLimit: Number(timeLimit),
          questions: data.questions,
          directions: data.directions || 'Attempt all questions.',
          difficulty: data.difficulty || 'Medium',
          createdBy: profile.uid,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          createdAt: serverTimestamp(),
          status: 'published',
        };

      } else if (type === 'assignment') {
        docData = {
          title: data.title,
          subject: data.subject || 'General',
          targetClass: cls, class: cls,
          type: 'homework',
          dueDate,
          tasks: data.tasks,
          instructions: data.instructions,
          objectives: data.objectives || [],
          totalMarks: data.totalMarks || 0,
          estimatedTime: data.estimatedTime || '',
          rubric: data.rubric || '',
          difficulty: data.difficulty || 'Medium',
          createdBy: profile.uid,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          createdAt: serverTimestamp(),
          status: 'published',
        };

      } else {
        // question paper
        docData = {
          title: data.title,
          subject: data.subject || 'General',
          targetClass: cls, class: cls,
          type: 'paper',
          dueDate,
          sections: data.sections || [],
          instructions: data.instructions || '',
          totalMarks: data.totalMarks || 0,
          duration: data.duration || '',
          difficulty: data.difficulty || 'Medium',
          createdBy: profile.uid,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          createdAt: serverTimestamp(),
          status: 'published',
        };

      }
      const ref = await addDoc(collection(db, 'schools', profile.schoolId, 'assignments'), docData);
      onPublished(ref.id);
      onClose();
    } catch (e: any) {
      alert('Failed to publish: ' + e.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-5 rounded-t-2xl flex items-center justify-between ${
          type === 'quiz' ? 'bg-gradient-to-r from-purple-600 to-indigo-600'
          : type === 'paper' ? 'bg-gradient-to-r from-slate-700 to-slate-900'
          : 'bg-gradient-to-r from-amber-500 to-orange-500'
        }`}>
          <div>
            <h2 className="text-white font-bold text-lg">
              {type === 'quiz' ? '⚡ Publish Quiz' : type === 'paper' ? '📄 Publish Question Paper' : '📋 Publish Assignment'}
            </h2>
            <p className="text-white/70 text-sm mt-0.5 truncate max-w-[240px]">{data.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20"><X className="w-5 h-5 text-white" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Target Class</label>
            {teacherClasses.length > 0 ? (
              <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500">
                {teacherClasses.map(c => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <input value={customClass} onChange={e => setCustomClass(e.target.value)}
                placeholder="e.g. 10A, 11B, 9C"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500" />
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><Calendar className="w-4 h-4" /> Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>

          {type === 'quiz' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><Clock className="w-4 h-4" /> Time Limit (minutes)</label>
              <input type="number" min={5} max={180} value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 border border-gray-100">
            <p className="font-bold text-gray-700 mb-1">Summary</p>
            <p>📖 {data.title}</p>
            {type === 'quiz' && <p>❓ {data.questions?.length} questions · {timeLimit} min</p>}
            {type === 'assignment' && <p>✏️ {data.tasks?.length} tasks · {data.totalMarks} marks</p>}
            {type === 'paper' && <p>📋 {data.sections?.length} sections · {data.totalMarks} marks · {data.duration}</p>}
          </div>

          <button onClick={handlePublish} disabled={publishing}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white transition-all ${
              type === 'quiz' ? 'bg-purple-600 hover:bg-purple-700'
              : type === 'paper' ? 'bg-slate-800 hover:bg-slate-900'
              : 'bg-amber-500 hover:bg-amber-600'
            } disabled:opacity-60`}>
            {publishing ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Publishing...</span></> : <><Send className="w-5 h-5" /><span>Publish to Students Now</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Generated content preview ─── */
function GeneratedContentCard({ data, profile, onPublished }: { data: any; profile: any; onPublished: (id: string) => void }) {
  const [showPublish, setShowPublish] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedId, setPublishedId] = useState('');

  const type = data.generationType || (data.isInteractiveQuiz ? 'quiz' : data.isAssignment ? 'assignment' : data.isPaper ? 'paper' : null);
  if (!type) return null;

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let htmlContent = `
      <html>
        <head>
          <title>${data.title || 'Sthara Educational Document'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a202c; padding: 40px; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 26px; font-weight: 800; border-bottom: 2px solid #1a202c; padding-bottom: 12px; margin-bottom: 8px; color: #111827; }
            .meta { font-size: 13px; color: #4b5563; margin-bottom: 30px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
            .question-block { margin-bottom: 24px; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; page-break-inside: avoid; background-color: #fafafa; }
            .question-title { font-weight: 700; font-size: 15px; color: #1f2937; }
            .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
            .option { padding: 8px 14px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; background-color: #ffffff; color: #374151; }
            .correct { background-color: #ecfdf5; border-color: #10b981; color: #065f46; font-weight: 700; }
            .section-title { font-size: 18px; font-weight: 800; color: #111827; background: #e5e7eb; padding: 8px 16px; margin-top: 32px; margin-bottom: 16px; border-radius: 6px; }
            .instructions { font-style: italic; color: #4b5563; font-size: 14px; margin-bottom: 24px; padding: 12px; border-left: 4px solid #9ca3af; background-color: #f9fafb; }
            .task-marks { float: right; font-weight: 800; color: #374151; font-size: 13px; background-color: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
            .explanation { font-size: 13px; color: #047857; font-style: italic; margin-top: 8px; padding: 8px; background-color: #f0fdf4; border-radius: 4px; border-left: 3px solid #10b981; }
          </style>
        </head>
        <body>
          <h1>${data.title || 'Untitled Document'}</h1>
          <div class="meta">
            Subject: ${data.subject || 'N/A'} &nbsp;|&nbsp; 
            Class: ${data.targetClass || 'N/A'} &nbsp;|&nbsp; 
            Difficulty: ${data.difficulty || 'Medium'}
            ${data.timeLimit ? `&nbsp;|&nbsp; Time Limit: ${data.timeLimit} mins` : ''}
            ${data.totalMarks ? `&nbsp;|&nbsp; Total Marks: ${data.totalMarks}` : ''}
            ${data.duration ? `&nbsp;|&nbsp; Duration: ${data.duration}` : ''}
          </div>
    `;

    if (type === 'quiz') {
      data.questions?.forEach((q: any, i: number) => {
        htmlContent += `
          <div class="question-block">
            <div class="question-title">Q${i + 1}. ${q.text}</div>
            <div class="options-grid">
              ${q.options?.map((o: any) => `
                <div class="option ${o.id === q.correctOptionId ? 'correct' : ''}">
                  ${o.id.toUpperCase()}. ${o.text}
                </div>
              `).join('')}
            </div>
            ${q.explanation ? `<div class="explanation"><strong>Explanation:</strong> ${q.explanation}</div>` : ''}
          </div>
        `;
      });
    } else if (type === 'assignment') {
      if (data.instructions) {
        htmlContent += `<div class="instructions"><strong>Instructions:</strong> ${data.instructions}</div>`;
      }
      data.tasks?.forEach((t: any) => {
        htmlContent += `
          <div class="question-block">
            <span class="task-marks">${t.marks} Marks</span>
            <div class="question-title">Task ${t.number}. ${t.question}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 6px; font-weight: 500;">Type: ${t.type}</div>
          </div>
        `;
      });
      if (data.rubric) {
        htmlContent += `
          <div class="section-title">Grading Rubric</div>
          <p style="white-space: pre-wrap; font-size: 14px; color: #374151; background-color: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb;">${data.rubric}</p>
        `;
      }
    } else if (type === 'paper') {
      if (data.instructions) {
        htmlContent += `<div class="instructions"><strong>Instructions:</strong> ${data.instructions}</div>`;
      }
      data.sections?.forEach((s: any) => {
        htmlContent += `<div class="section-title">${s.name} (${s.marks} Marks)</div>`;
        s.questions?.forEach((q: any) => {
          htmlContent += `
            <div class="question-block">
              <span class="task-marks">${q.marks} Marks</span>
              <div class="question-title">Q${q.number}. ${q.text}</div>
              ${q.options ? `
                <div class="options-grid">
                  ${q.options.map((o: any, idx: number) => `
                    <div class="option ${o === q.answer ? 'correct' : ''}">
                      ${String.fromCharCode(65 + idx)}. ${o}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${q.answer ? `<div class="explanation"><strong>Answer/Key Points:</strong> ${q.answer}</div>` : ''}
            </div>
          `;
        });
      });
    }

    htmlContent += `
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const color = type === 'quiz' ? 'purple' : type === 'paper' ? 'slate' : 'amber';
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  const badge = type === 'quiz' ? '⚡ Quiz' : type === 'paper' ? '📄 Question Paper' : '📋 Assignment';

  return (
    <div className={`rounded-2xl border-2 p-5 ${colorMap[color]} space-y-4`}>
      {showPublish && (
        <PublishModal
          profile={profile}
          data={data}
          onClose={() => setShowPublish(false)}
          onPublished={(id) => {
            setPublished(true);
            setPublishedId(id);
            onPublished(id);
          }}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-black uppercase tracking-wider opacity-70">{badge}</span>
          <h3 className="font-black text-lg text-gray-900 mt-0.5">{data.title}</h3>
          <p className="text-sm opacity-70 mt-0.5">
            {type === 'quiz' && `${data.questions?.length} questions · ${data.timeLimit} min · ${data.difficulty}`}
            {type === 'assignment' && `${data.tasks?.length} tasks · ${data.totalMarks} marks · ${data.difficulty}`}
            {type === 'paper' && `${data.sections?.length} sections · ${data.totalMarks} marks · ${data.duration}`}
          </p>
        </div>
      </div>

      {/* Preview */}
      {type === 'quiz' && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {data.questions?.map((q: any, i: number) => (
            <div key={i} className="bg-white/80 rounded-xl p-3 text-sm border border-purple-100/50">
              <p className="font-bold text-gray-800">Q{i+1}. {q.text}</p>
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                {q.options?.map((o: any) => (
                  <span key={o.id} className={`text-xs px-2 py-1 rounded-lg ${o.id === q.correctOptionId ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-gray-100 text-gray-600'}`}>
                    {o.id.toUpperCase()}. {o.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {type === 'assignment' && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {data.tasks?.map((t: any, i: number) => (
            <div key={i} className="bg-white/80 rounded-xl p-3 text-sm flex gap-3 border border-amber-100/50">
              <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">{t.number}</span>
              <div>
                <span className="text-xs font-bold opacity-60 uppercase">{t.type} · {t.marks} marks</span>
                <p className="text-gray-800 font-medium text-xs mt-0.5">{t.question}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {type === 'paper' && (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {data.sections?.map((s: any, i: number) => (
            <div key={i} className="bg-white/80 rounded-xl p-4 text-sm border border-slate-200/50 space-y-3">
              <div>
                <p className="font-extrabold text-gray-900 border-b border-gray-100 pb-1.5">{s.name}</p>
                <p className="text-xs text-gray-500 font-bold mt-0.5">{s.questions?.length || 0} questions · {s.marks} marks</p>
              </div>
              <div className="space-y-3 pt-1">
                {s.questions?.map((q: any, idx: number) => (
                  <div key={idx} className="pl-3 border-l-2 border-slate-300 space-y-1">
                    <p className="font-bold text-gray-800 text-xs">Q{q.number}. {q.text} <span className="text-[10px] text-gray-400">({q.marks}M)</span></p>
                    {q.options && (
                      <div className="grid grid-cols-2 gap-1 pl-1 mt-1">
                        {q.options.map((o: any, oIdx: number) => (
                          <span key={oIdx} className={`text-[10px] px-2 py-0.5 rounded-lg ${o === q.answer ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200' : 'bg-gray-100/70 text-gray-500'}`}>
                            {String.fromCharCode(65 + oIdx)}. {o}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {published ? (
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <CheckCircle className="w-5 h-5" />
            <span>Published Successfully!</span>
            <Link href="/teacher/grading" className="text-xs underline opacity-70">View in Grading</Link>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowPublish(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white text-sm shadow-md hover:-translate-y-0.5 transition-all ${
                type === 'quiz' ? 'bg-purple-600 hover:bg-purple-700'
                : type === 'paper' ? 'bg-slate-800 hover:bg-slate-900'
                : 'bg-amber-500 hover:bg-amber-600'
              }`}>
              <Send className="w-4 h-4" />
              Post to Students
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white border border-gray-300 hover:bg-gray-50 transition-all">
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Single chat message bubble ─── */
function MessageBubble({ message, profile, onPublished, onQuickReply, router }: {
  message: ChatMessage;
  profile: any;
  onPublished: (id: string) => void;
  onQuickReply: (text: string) => void;
  router: any;
}) {
  const isUser = message.role === 'user';
  const navPath = !isUser ? detectNavIntent(message.content) : null;

  // Strip JSON block from displayed content
  const displayContent = message.content.replace(/```json\n[\s\S]*?\n```/g, '').trim();

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-3`}>
      {!isUser && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
      )}

      <div className={`max-w-[80%] space-y-3 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#002147] text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
        }`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Generated content card */}
        {!isUser && message.generatedData && (
          <GeneratedContentCard
            data={message.generatedData}
            profile={profile}
            onPublished={onPublished}
          />
        )}

        {/* Navigation shortcut */}
        {navPath && (
          <button
            onClick={() => router.push(navPath)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 font-bold text-sm hover:bg-indigo-100 transition-all">
            <ChevronRight className="w-4 h-4" />
            Open page now
          </button>
        )}

        {/* Quick reply chips */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => onQuickReply(a.value)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-700 hover:border-indigo-400 hover:text-indigo-700 transition-all">
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-9 h-9 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 mt-1 font-black text-gray-600 text-sm">
          {profile?.name?.charAt(0) || 'T'}
        </div>
      )}
    </div>
  );
}

/* ─── Sidebar nav items ─── */
const SIDEBAR_ITEMS = [
  { icon: <GraduationCap className="w-4 h-4" />, label: 'Dashboard', href: '/teacher', color: 'text-blue-600 bg-blue-50' },
  { icon: <Layers className="w-4 h-4" />, label: 'Grading Gallery', href: '/teacher/grading', color: 'text-violet-600 bg-violet-50' },
  { icon: <Zap className="w-4 h-4" />, label: 'Quiz Builder', href: '/teacher/quiz', color: 'text-purple-600 bg-purple-50' },
  { icon: <BookOpen className="w-4 h-4" />, label: 'Syllabus Planner', href: '/teacher/syllabus', color: 'text-indigo-600 bg-indigo-50' },
  { icon: <Activity className="w-4 h-4" />, label: 'Class Heatmap', href: '/teacher/heatmap', color: 'text-orange-600 bg-orange-50' },
  { icon: <BarChart2 className="w-4 h-4" />, label: 'Mastery Tracker', href: '/teacher/mastery', color: 'text-emerald-600 bg-emerald-50' },
  { icon: <PenTool className="w-4 h-4" />, label: 'Post Materials', href: '/teacher/feed', color: 'text-rose-600 bg-rose-50' },
  { icon: <Heart className="w-4 h-4" />, label: 'Wellness', href: '/teacher/wellness', color: 'text-pink-600 bg-pink-50' },
];

/* ─── MAIN PAGE ─── */
export default function TeacherAIAssistantChat() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Welcome message on first load
  useEffect(() => {
    if (profile && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi ${profile.name?.split(' ')[0] || 'Teacher'}! 👋 I'm Sthara AI, your intelligent teaching assistant.\n\nI can help you:\n- **Create assignments, quizzes & question papers** — just tell me what you need\n- **Navigate the app** — say "open grading" or "take me to heatmap"\n- **Plan lessons, rubrics, summaries** and more\n\nWhat would you like to do today?`,
        timestamp: new Date(),
        actions: [
          { label: '⚡ Make a Quiz', icon: 'zap', value: 'Create a quiz for my class' },
          { label: '📋 Assignment', icon: 'clipboard', value: 'Create a homework assignment' },
          { label: '📄 Question Paper', icon: 'file', value: 'Generate a full question paper for an exam' },
        ],
      }]);
    }
  }, [profile, messages.length]);

  const sendMessage = useCallback(async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || isTyping) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const authToken = await getAuth().currentUser?.getIdToken();

      // Build message history for API
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.content,
      }));

      const response = await fetch('/api/teacher/assistant-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to get AI response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      const assistantId = (Date.now() + 1).toString();

      // Add streaming message placeholder
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: fullContent } : m
        ));
      }

      // Parse generated content
      const generatedData = parseGeneratedContent(fullContent);

      // Update final message with parsed data
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: fullContent, generatedData: generatedData || undefined }
          : m
      ));

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I ran into an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, messages, isTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-gray-50 print:bg-white">
      <style>{`@media print { @page { size: A4; margin: 1cm; } .no-print { display: none; } }`}</style>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden no-print">
          <Link href="/teacher" className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm">Sthara AI</p>
              <p className="text-gray-400 text-xs">Teaching Assistant</p>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 max-w-3xl w-full mx-auto">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              profile={profile}
              onPublished={(id) => setPublishedIds(prev => [...prev, id])}
              onQuickReply={(text) => sendMessage(text)}
              router={router}
            />
          ))}

          {isTyping && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center h-5">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Quick actions in empty-ish state */}
          {messages.length <= 1 && !isTyping && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Quick actions</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.prompt)}
                    className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group text-center">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{action.icon}</span>
                    <span className="text-xs font-bold text-gray-700 group-hover:text-indigo-700">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <div className="border-t border-gray-200 bg-white px-4 py-4 no-print">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end bg-gray-50 border border-gray-200 rounded-2xl p-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to create a quiz, assignment, question paper, or navigate the app…"
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-gray-800 placeholder-gray-400 text-sm leading-relaxed max-h-32"
                style={{ minHeight: '24px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isTyping}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#002147] text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 shadow-md hover:-translate-y-0.5">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-2">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}
