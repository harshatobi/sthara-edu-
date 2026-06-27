'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowLeft, Send, Copy, CheckCircle, BrainCircuit, Download, SendIcon, Loader2, Maximize, Minimize } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuthToken } from '@/lib/auth/getAuthToken';

const QuizWorksheet = ({ data }: { data: any }) => {
  return (
    <div className="font-sans text-[#002147] w-full mx-auto bg-white">
      <h1 className="text-4xl font-black text-center mb-10 tracking-tight">{data.title || "Quiz"}</h1>
      
      <div className="flex justify-between items-end mb-10 gap-8">
        <div className="flex-1">
          <label className="font-bold text-lg mb-2 block">Name:</label>
          <div className="border-b-2 border-gray-300 h-8"></div>
        </div>
        <div className="flex-1">
          <label className="font-bold text-lg mb-2 block">Date:</label>
          <div className="border-b-2 border-gray-300 h-8"></div>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="font-bold text-xl mb-2">Directions</h2>
        <div className="text-gray-700 font-medium">
          {data.directions}
        </div>
      </div>

      <div className="space-y-10">
        {data.questions?.map((q: any, i: number) => (
          <div key={i} className="pb-8 border-b border-gray-100 last:border-0">
            <h3 className="font-bold text-lg mb-6 leading-relaxed">{i + 1}. {q.text}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
              {q.options?.map((opt: string, optIdx: number) => (
                <div key={optIdx} className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full border border-gray-400 flex items-center justify-center text-sm shrink-0">
                    {String.fromCharCode(97 + optIdx)}
                  </div>
                  <span className="font-medium pt-0.5">{opt}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Answer Key (hidden from print) */}
      <div className="mt-16 pt-8 border-t-2 border-dashed border-gray-300 print:hidden">
        <h2 className="font-bold text-2xl mb-6 text-purple-600 flex items-center"><CheckCircle className="w-6 h-6 mr-2" /> Teacher Answer Key</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.questions?.map((q: any, i: number) => (
            <div key={i} className="bg-purple-50 p-4 rounded-xl border border-purple-100">
              <span className="font-bold text-lg mr-2">Q{i + 1}:</span> 
              <span className="uppercase font-black text-lg text-purple-700">{String.fromCharCode(97 + q.answerIndex)}</span>
              <p className="text-sm mt-2 text-purple-800">{q.explanation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function TeacherAIAssistant() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  // Form State
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('Grade 10');
  const [tone, setTone] = useState('Academic & Professional');
  const [outputFormat, setOutputFormat] = useState('Standard Lesson Plan');

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  
  // Action States
  const [copied, setCopied] = useState(false);
  const [isPosted, setIsPosted] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setGeneratedContent('');
    setIsGenerating(true);
    setCopied(false);
    setIsPosted(false);

    // "Think for a second or two"
    setLoadingText("Synthesizing pedagogical requirements...");
    await new Promise(r => setTimeout(r, 1000));
    setLoadingText("Connecting to Sthara Intelligence Engine...");
    await new Promise(r => setTimeout(r, 1000));

    try {
      const authToken = await getAuthToken();
      const response = await fetch('/api/teacher/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ topic, gradeLevel, tone, outputFormat })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Failed to generate content. Please try again.");
        return;
      }

      setGeneratedContent('');
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream not available");
      
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const textChunk = decoder.decode(value, { stream: true });
        setGeneratedContent((prev) => prev + textChunk);
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    window.print();
  };

  const handlePostToStudents = async () => {
    if (!profile?.schoolId || !generatedContent) return;
    setIsPosting(true);
    try {
      // Create a document in the assignments collection so it shows up for students
      await addDoc(collection(db, 'schools', profile.schoolId, 'assignments'), {
        title: `AI Generated ${outputFormat}: ${topic.substring(0, 30)}...`,
        content: generatedContent,
        format: outputFormat,
        teacherId: profile.uid,
        teacherName: profile.name,
        createdAt: serverTimestamp(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Due in 7 days
        targetAudience: 'all'
      });

      setIsPosted(true);
      setTimeout(() => setIsPosted(false), 3000);
    } catch (e: any) {
      console.error(e);
      alert('Failed to post to students: ' + e.message);
    } finally {
      setIsPosting(false);
    }
  };

  // Safe JSON parser for Quiz Worksheet
  let parsedQuizData = null;
  if (generatedContent && outputFormat.includes('Quiz')) {
    try {
      let contentToParse = generatedContent.trim();
      const jsonMatch = contentToParse.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        contentToParse = jsonMatch[1];
      } else if (contentToParse.startsWith('```json')) {
        contentToParse = contentToParse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      const data = JSON.parse(contentToParse);
      if (data.isQuiz) parsedQuizData = data;
    } catch (e) {
      console.error("Failed to parse Quiz JSON", e);
    }
  }

  if (loading || !profile) return <div className="p-10 flex justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12 font-sans print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: landscape; margin: 0.5cm; }
        }
      `}</style>
      
      {/* HEADER - Hidden when printing PDF */}
      <div className="bg-[#002147] text-white pt-10 pb-16 px-8 relative overflow-hidden print:hidden">
        <div className="max-w-[1400px] mx-auto relative z-10 flex items-center space-x-4">
          <Link href="/teacher" className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <div className="flex items-center space-x-2 text-purple-300 text-xs font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-3 h-3" />
              <span>Sthara Intelligence Engine</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">AI Teaching Assistant</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-4 -mt-8 relative z-20 flex flex-col lg:flex-row gap-8 print:block print:w-full print:mt-0 print:px-0 print:gap-0">
        
        {/* FORM PANEL - Hidden when printing PDF */}
        <div className="lg:w-1/3 space-y-6 print:hidden">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Topic or Concept</label>
                <textarea 
                  required
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. The causes of the French Revolution, focusing on economic inequality."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none font-medium"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Grade Level</label>
                <select 
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option>Grade 6</option>
                  <option>Grade 7</option>
                  <option>Grade 8</option>
                  <option>Grade 9</option>
                  <option>Grade 10</option>
                  <option>Grade 11</option>
                  <option>Grade 12</option>
                  <option>College Level</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Tone</label>
                <select 
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option>Academic & Professional</option>
                  <option>Strictly Factual</option>
                  <option>Encouraging & Fun</option>
                  <option>Socratic / Questioning</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Output Format</label>
                <select 
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option>Standard Lesson Plan</option>
                  <option>Grading Rubric Table</option>
                  <option>Multiple Choice Quiz</option>
                  <option>Bullet-point Summary</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={isGenerating || !topic.trim()}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {isGenerating ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {loadingText}</>
                ) : (
                  <><BrainCircuit className="w-5 h-5 mr-2" /> Generate Intelligence</>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* OUTPUT PANEL - This is the part that gets printed */}
        <div className={`print:w-full ${isFullscreen ? 'fixed inset-0 z-[100] bg-gray-100 overflow-y-auto p-4 md:p-8' : 'lg:w-2/3'}`}>
          {generatedContent ? (
            <div className={`bg-white overflow-hidden print:border-none print:shadow-none print:rounded-none ${isFullscreen ? 'min-h-screen max-w-5xl mx-auto rounded-2xl shadow-2xl border border-gray-200' : 'rounded-2xl shadow-lg border border-gray-200'}`}>
              
              {/* Output Actions Bar - Above Output - Hidden on Print */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center print:hidden">
                <span className="font-bold text-gray-600 text-sm tracking-wider uppercase">Generated Output</span>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="flex items-center justify-center p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={handleCopy}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button 
                    onClick={handleExport}
                    className="flex items-center space-x-2 px-4 py-2 bg-[#002147] text-white rounded-lg hover:bg-[#003366] font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export to PDF</span>
                  </button>
                </div>
              </div>

              {/* Actual Generated Content Wrapper */}
              <div className="p-8 md:p-12 print:p-0">
                {parsedQuizData ? (
                  <QuizWorksheet data={parsedQuizData} />
                ) : (
                  <div className="prose prose-lg max-w-none text-gray-800">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({node, ...props}) => <h1 className="text-3xl font-black mb-6 text-[#002147]" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-8 mb-4 text-[#002147] border-b pb-2" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-xl font-bold mt-6 mb-3 text-gray-800" {...props} />,
                        p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
                        li: ({node, ...props}) => <li className="pl-2" {...props} />,
                        table: ({node, ...props}) => (
                          <div className="my-8 w-full overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-left border-collapse min-w-[800px]" {...props} />
                          </div>
                        ),
                        thead: ({node, ...props}) => <thead className="bg-[#002147] text-white" {...props} />,
                        th: ({node, ...props}) => <th className="p-4 font-bold tracking-wider text-white" {...props} />,
                        td: ({node, ...props}) => <td className="p-4 border-t border-gray-200 align-top bg-white" {...props} />,
                        tr: ({node, ...props}) => <tr className="even:bg-gray-50/50" {...props} />
                      }}
                    >
                      {generatedContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Bottom Action Bar - Hidden on Print */}
              <div className="bg-gray-50 px-6 py-5 border-t border-gray-200 flex justify-center print:hidden">
                <button 
                  onClick={handlePostToStudents}
                  disabled={isPosting || isPosted}
                  className={`flex items-center space-x-2 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-md ${isPosted ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'}`}
                >
                  {isPosting ? <Loader2 className="w-5 h-5 animate-spin" /> : isPosted ? <CheckCircle className="w-5 h-5" /> : <SendIcon className="w-5 h-5" />}
                  <span>{isPosting ? 'Posting...' : isPosted ? 'Successfully Posted!' : 'Post it to Students'}</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 print:hidden">
              <BrainCircuit className="w-16 h-16 text-gray-200 mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Awaiting Instructions</h3>
              <p className="text-gray-400 max-w-sm">Fill out the prompt configuration on the left and hit generate to create spectacular, highly-accurate educational material.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
