'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Brain, Send, Loader2, TrendingUp, TrendingDown,
  AlertTriangle, Users, BookOpen, Filter, Sparkles, RefreshCw,
  ChevronDown, Trophy, Target, BarChart3, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface StudentInsight {
  id: string;
  name: string;
  email: string;
  studentClass: string;
  avgScore: number | null;
  totalSubmissions: number;
  customStudentId?: string;
}

const QUICK_PROMPTS = [
  "Who are the top 5 performing students?",
  "Show students scoring below 50%",
  "Which class has the lowest average?",
  "How many students haven't submitted any assignments?",
  "What is the overall school average score?",
  "List students at risk of failing",
  "Show compliance summary for 2026 regulations",
  "Which subject has the lowest scores?",
];

export default function AdminAI() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Data
  const [students, setStudents] = useState<StudentInsight[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // AI Chat
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content: `👋 Hello! I'm your **Admin AI Assistant** for this institution. I have full access to your school's student performance data, submission records, and compliance metrics.\n\nAsk me anything like:\n• "Who are the weakest students in Class 10?"\n• "Show students scoring below 40%"\n• "Give me a compliance report for this semester"\n• "Which class needs immediate attention?"`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Insight filters
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'high' | 'no-submissions'>('all');
  const [filterClass, setFilterClass] = useState('all');
  const [scoreThreshold, setScoreThreshold] = useState(50);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'admin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    loadStudentInsights();
  }, [profile?.schoolId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadStudentInsights = async () => {
    setDataLoading(true);
    try {
      // Fetch all students
      const { data: studentRows } = await supabase
        .from('users')
        .select('id, name, email, student_class, branch, custom_student_id')
        .eq('school_id', profile!.schoolId)
        .eq('role', 'student');

      // Fetch all submissions for school
      const { data: submissions } = await supabase
        .from('submissions')
        .select('student_id, score, max_score, teacher_approved')
        .eq('school_id', profile!.schoolId);

      // Build per-student stats
      const subsByStudent: Record<string, { score: number; max: number }[]> = {};
      (submissions || []).forEach(s => {
        if (s.teacher_approved === false) return;
        if (s.score === null || !s.max_score) return;
        if (!subsByStudent[s.student_id]) subsByStudent[s.student_id] = [];
        subsByStudent[s.student_id].push({ score: s.score, max: s.max_score });
      });

      const insights: StudentInsight[] = (studentRows || []).map(s => {
        const subs = subsByStudent[s.id] || [];
        const totalScore = subs.reduce((a, b) => a + b.score, 0);
        const totalMax = subs.reduce((a, b) => a + b.max, 0);
        return {
          id: s.id,
          name: s.name || 'Unknown',
          email: s.email || '',
          studentClass: s.student_class || s.branch || 'Unassigned',
          avgScore: subs.length > 0 ? Math.round((totalScore / totalMax) * 100) : null,
          totalSubmissions: subs.length,
          customStudentId: s.custom_student_id,
        };
      });

      // Sort by avgScore ascending (worst first)
      insights.sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101));
      setStudents(insights);
    } catch (err) {
      console.error('[admin-ai] loadStudentInsights error:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const buildContext = () => {
    const schoolAvg = students.filter(s => s.avgScore !== null).length > 0
      ? Math.round(students.filter(s => s.avgScore !== null).reduce((a, s) => a + (s.avgScore ?? 0), 0) / students.filter(s => s.avgScore !== null).length)
      : null;

    const atRisk = students.filter(s => s.avgScore !== null && s.avgScore < 40);
    const noSubs = students.filter(s => s.totalSubmissions === 0);
    const top = [...students].filter(s => s.avgScore !== null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 5);

    const classSummary: Record<string, { total: number; scores: number[] }> = {};
    students.forEach(s => {
      if (!classSummary[s.studentClass]) classSummary[s.studentClass] = { total: 0, scores: [] };
      classSummary[s.studentClass].total++;
      if (s.avgScore !== null) classSummary[s.studentClass].scores.push(s.avgScore);
    });

    const classAvgs = Object.entries(classSummary).map(([cls, d]) => ({
      class: cls,
      students: d.total,
      avg: d.scores.length > 0 ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : null,
    }));

    return `
SCHOOL DATA CONTEXT:
School: ${profile?.schoolId}
Total Students: ${students.length}
School Average Score: ${schoolAvg !== null ? schoolAvg + '%' : 'No data yet'}
Students At Risk (<40%): ${atRisk.length}
Students with No Submissions: ${noSubs.length}

TOP 5 STUDENTS:
${top.map((s, i) => `${i + 1}. ${s.name} (${s.studentClass}) — ${s.avgScore}%`).join('\n')}

AT-RISK STUDENTS (<40%):
${atRisk.slice(0, 10).map(s => `- ${s.name} (${s.studentClass}) — ${s.avgScore}% | ${s.totalSubmissions} submissions`).join('\n') || 'None'}

STUDENTS WITH NO SUBMISSIONS:
${noSubs.slice(0, 10).map(s => `- ${s.name} (${s.studentClass})`).join('\n') || 'None'}

CLASS-WISE PERFORMANCE:
${classAvgs.map(c => `- ${c.class}: ${c.students} students, avg ${c.avg !== null ? c.avg + '%' : 'no data'}`).join('\n')}

ALL STUDENTS (name | class | avg%):
${students.slice(0, 50).map(s => `${s.name} | ${s.studentClass} | ${s.avgScore !== null ? s.avgScore + '%' : 'No data'}`).join('\n')}
`.trim();
  };

  const handleSend = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || isSending) return;

    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setInput('');
    setIsSending(true);

    try {
      const authToken = await getAuthToken();
      const context = buildContext();

      const res = await fetch('/api/admin/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: userMsg,
          context,
          history: messages.slice(-6).map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.content }] })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI error');

      setMessages(prev => [...prev, { role: 'ai', content: data.reply, timestamp: new Date() }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `❌ Sorry, I encountered an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsSending(false);
    }
  };

  // Filtered student list
  const uniqueClasses = [...new Set(students.map(s => s.studentClass))].sort();
  const filteredStudents = students
    .filter(s => filterClass === 'all' || s.studentClass === filterClass)
    .filter(s => {
      if (filterMode === 'low') return s.avgScore !== null && s.avgScore < scoreThreshold;
      if (filterMode === 'high') return s.avgScore !== null && s.avgScore >= scoreThreshold;
      if (filterMode === 'no-submissions') return s.totalSubmissions === 0;
      return true;
    });

  const schoolAvg = students.filter(s => s.avgScore !== null).length > 0
    ? Math.round(students.filter(s => s.avgScore !== null).reduce((a, s) => a + (s.avgScore ?? 0), 0) / students.filter(s => s.avgScore !== null).length)
    : null;

  const atRiskCount = students.filter(s => s.avgScore !== null && s.avgScore < 40).length;
  const noSubsCount = students.filter(s => s.totalSubmissions === 0).length;
  const excellentCount = students.filter(s => s.avgScore !== null && s.avgScore >= 75).length;

  if (loading || !profile) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 backdrop-blur-xl bg-white/90">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-[#002147]">Admin AI Intelligence</h1>
                <p className="text-xs text-gray-500">Student insights • Compliance tracking • Performance analytics</p>
              </div>
            </div>
          </div>
          <button
            onClick={loadStudentInsights}
            disabled={dataLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase">Total</span>
            </div>
            <div className="text-3xl font-black text-[#002147]">{students.length}</div>
            <div className="text-sm text-gray-500 mt-1">Students Enrolled</div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Trophy className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">≥75%</span>
            </div>
            <div className="text-3xl font-black text-emerald-600">{excellentCount}</div>
            <div className="text-sm text-gray-500 mt-1">Excellent Students</div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-red-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">&lt;40%</span>
            </div>
            <div className="text-3xl font-black text-red-600">{atRiskCount}</div>
            <div className="text-sm text-gray-500 mt-1">At Risk Students</div>
          </div>

          <div className="bg-gradient-to-br from-[#002147] to-indigo-800 rounded-2xl p-5 border border-indigo-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-indigo-200">School Avg</span>
            </div>
            <div className="text-3xl font-black text-white">{schoolAvg !== null ? `${schoolAvg}%` : '--'}</div>
            <div className="text-sm text-indigo-300 mt-1">Overall Performance</div>
          </div>
        </div>

        {/* Main Grid: AI Chat + Student Table */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── AI CHAT ── */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col" style={{ height: '700px' }}>
            {/* Chat header */}
            <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-t-3xl">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-[#002147] text-sm">Admin AI Assistant</div>
                <div className="text-xs text-gray-500">Powered by Gemini • Has access to all school data</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-emerald-600">Online</span>
              </div>
            </div>

            {/* Quick prompts */}
            <div className="px-4 py-3 flex gap-2 overflow-x-auto border-b border-gray-100 bg-gray-50/50">
              {QUICK_PROMPTS.slice(0, 4).map(p => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  disabled={isSending}
                  className="flex-shrink-0 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <Brain className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    <div className={`text-xs mt-1.5 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mr-2 flex-shrink-0">
                    <Brain className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-none px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* More quick prompts */}
            <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-gray-100 bg-gray-50/50">
              {QUICK_PROMPTS.slice(4).map(p => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  disabled={isSending}
                  className="flex-shrink-0 px-3 py-1.5 bg-white border border-violet-200 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-50 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100">
              <div className="flex gap-3">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Ask anything about your school's data..."
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-[#002147] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isSending}
                  className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center transition-all shadow-md"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* ── STUDENT INSIGHTS TABLE ── */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col" style={{ height: '700px' }}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-[#002147] flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  Student Performance Insights
                </h2>
                <span className="text-xs text-gray-400 font-medium">{filteredStudents.length} students</span>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterMode}
                  onChange={e => setFilterMode(e.target.value as any)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Students</option>
                  <option value="low">Low Scorers</option>
                  <option value="high">High Scorers</option>
                  <option value="no-submissions">No Submissions</option>
                </select>

                {(filterMode === 'low' || filterMode === 'high') && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="text-xs font-bold text-gray-600">Threshold:</span>
                    <input
                      type="number"
                      value={scoreThreshold}
                      onChange={e => setScoreThreshold(Number(e.target.value))}
                      min={0} max={100}
                      className="w-14 text-xs font-bold text-indigo-700 bg-transparent focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                )}

                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Classes</option>
                  {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {dataLoading ? (
                <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading student data...</span>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <Filter className="w-10 h-10 mb-3 text-gray-300" />
                  <p className="font-medium">No students match this filter</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Class</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Submissions</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredStudents.map(s => {
                      const scoreColor = s.avgScore === null
                        ? 'text-gray-400 bg-gray-50'
                        : s.avgScore >= 75 ? 'text-emerald-700 bg-emerald-50'
                        : s.avgScore >= 50 ? 'text-amber-700 bg-amber-50'
                        : 'text-red-700 bg-red-50';

                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-[#002147] text-sm">{s.name}</div>
                            <div className="text-xs text-gray-400 font-mono">{s.customStudentId || s.id.slice(0, 8)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                              {s.studentClass}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${s.totalSubmissions === 0 ? 'text-red-500' : 'text-gray-700'}`}>
                              {s.totalSubmissions}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-extrabold px-3 py-1 rounded-xl ${scoreColor}`}>
                              {s.avgScore !== null ? `${s.avgScore}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Compliance Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-emerald-700">Regulatory Compliance</span>
                <span>•</span>
                <span>
                  {noSubsCount > 0
                    ? `⚠️ ${noSubsCount} students need engagement`
                    : '✅ All students engaged'}
                </span>
                <span>•</span>
                <button
                  onClick={() => handleSend('Give me a detailed regulatory compliance report for this school')}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Full Compliance Report →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
