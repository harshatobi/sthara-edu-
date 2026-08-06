'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ArrowLeft, Send, Loader2,
  Copy, CheckCircle, Bot, User,
  FileText, ClipboardList, BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

const QUICK_PROMPTS = [
  { icon: ClipboardList, label: 'Create a quiz', text: 'Create a 10-question MCQ quiz on Quadratic Equations for Class 10.' },
  { icon: FileText,      label: 'Lesson plan',  text: 'Create a lesson plan for teaching Photosynthesis to Class 9.' },
  { icon: BookOpen,      label: 'Assignment',    text: 'Generate a homework assignment on the French Revolution for Class 11.' },
];

export default function TeacherAiAssistant() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your **AI Teaching Co-Pilot**. I can help you:\n\n- 📝 Create quizzes, assignments, and question papers\n- 📚 Draft lesson plans\n- 💡 Generate grading rubrics\n- 🗓 Plan your syllabus\n\nWhat would you like to create today?`,
    },
  ]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Build history array in the format assistant-chat expects
  const buildHistory = (msgs: ChatMessage[]) =>
    msgs.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: m.content,
    }));

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setInput('');
    setIsSending(true);

    abortRef.current = new AbortController();

    try {
      // Build history from all messages INCLUDING the new user message
      const allMsgs = [...messages, userMsg];
      const history = buildHistory(allMsgs);

      const res = await fetch('/api/teacher/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          teachingSubjects: profile?.assignments?.map((a: any) => ({
            subjectName: a.subject,
            className: a.class,
          })) || [],
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`API error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // Update streaming message in real time
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: accumulated, isStreaming: true }
              : m
          )
        );
      }

      // Mark streaming done
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: accumulated, isStreaming: false }
            : m
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[ai-assistant] error:', err);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '⚠️ Sorry, the AI encountered an error. Please try again.', isStreaming: false }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [messages, isSending, profile]);

  const handleSend = () => sendMessage(input);

  // Try to detect & render a JSON block (quiz/assignment) nicely
  const renderMessageContent = (msg: ChatMessage) => {
    const content = msg.content;
    // Try to extract JSON from ```json ... ``` blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const preText = content.substring(0, content.indexOf('```json')).trim();
        return (
          <div className="space-y-3">
            {preText && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{preText}</ReactMarkdown>
            )}
            <GeneratedContentCard data={parsed} />
          </div>
        );
      } catch {
        // fall through to markdown
      }
    }
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  };

  if (loading || !profile) return (
    <div className="p-10 text-center text-[#002147] font-medium">Loading AI Co-Pilot...</div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">AI Teaching Co-Pilot</h1>
          <p className="text-gray-500 text-sm mt-1">Draft quizzes, lesson plans, assignments & question papers</p>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-xs font-bold text-indigo-700">Gemini 2.5 Flash</span>
        </div>
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="grid grid-cols-3 gap-3">
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.label}
              onClick={() => sendMessage(qp.text)}
              className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-2xl text-sm font-semibold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
            >
              <qp.icon className="w-4 h-4 text-indigo-500 shrink-0" />
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Chat window */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col h-[620px]">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-indigo-600" />
                </div>
              )}

              <div className={`group relative max-w-[82%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#002147] text-white rounded-br-none'
                      : 'bg-gray-50 text-gray-800 rounded-bl-none border border-gray-200/60'
                  }`}
                >
                  {msg.role === 'user'
                    ? <p>{msg.content}</p>
                    : renderMessageContent(msg)
                  }
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 rounded-full ml-1 animate-pulse" />
                  )}
                </div>

                {/* Copy button for assistant messages */}
                {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                  <button
                    onClick={() => handleCopy(msg.content, msg.id)}
                    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm"
                  >
                    {copiedId === msg.id
                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3.5 h-3.5 text-gray-400" />
                    }
                  </button>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[#002147] flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Create a quiz on... / Lesson plan for... / Assignment about..."
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all shadow-md disabled:opacity-50"
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-center">AI can make mistakes. Always review generated content before use.</p>
        </div>
      </div>
    </div>
  );
}

// ── Mini component: renders generated quiz/assignment JSON visually ────────────
function GeneratedContentCard({ data }: { data: any }) {
  const [saved, setSaved] = useState(false);

  if (data.isInteractiveQuiz || data.generationType === 'quiz') {
    return (
      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-indigo-100 border-b border-indigo-200">
          <div>
            <p className="font-black text-indigo-800 text-sm">🎯 {data.title}</p>
            <p className="text-xs text-indigo-600 mt-0.5">{data.questions?.length} questions · {data.difficulty || 'Mixed'}</p>
          </div>
          <span className="text-xs font-bold bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full">Quiz</span>
        </div>
        <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
          {(data.questions || []).slice(0, 5).map((q: any, i: number) => (
            <div key={i} className="p-3 bg-white rounded-xl border border-indigo-100 text-xs">
              <p className="font-bold text-[#002147]">{i + 1}. {q.text}</p>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {(q.options || []).map((opt: any, j: number) => (
                  <span key={j} className={`px-2 py-1 rounded-md ${opt.id === q.correctOptionId || j === q.answerIndex ? 'bg-emerald-50 text-emerald-700 font-bold' : 'bg-gray-50 text-gray-600'}`}>
                    {typeof opt === 'string' ? opt : opt.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(data.questions?.length || 0) > 5 && (
            <p className="text-xs text-center text-indigo-500 font-semibold">+{data.questions.length - 5} more questions</p>
          )}
        </div>
      </div>
    );
  }

  if (data.isAssignment || data.generationType === 'assignment') {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-amber-100 border-b border-amber-200">
          <div>
            <p className="font-black text-amber-800 text-sm">📝 {data.title}</p>
            <p className="text-xs text-amber-600 mt-0.5">{data.tasks?.length} tasks · {data.totalMarks} marks · {data.estimatedTime}</p>
          </div>
          <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full">Assignment</span>
        </div>
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {(data.tasks || []).map((t: any, i: number) => (
            <div key={i} className="p-2.5 bg-white rounded-xl border border-amber-100 text-xs">
              <span className="font-bold text-[#002147]">Q{t.number}.</span>
              <span className="ml-1 text-gray-700">{t.question}</span>
              <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">[{t.marks}m]</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: raw JSON code block
  return (
    <pre className="text-xs bg-gray-900 text-green-400 rounded-xl p-4 overflow-x-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
