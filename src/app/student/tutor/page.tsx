'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { Sparkles, ArrowLeft, Send, User, AlertTriangle, PlayCircle, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/* ─────────────────────────────────────────────────────────
   🚨 SBI — Sthara Bureau of Investigation
   EASTER EGG: Only shown to test accounts (uid starts with 'testst')
   Real students NEVER see this — they get the normal polite warning
───────────────────────────────────────────────────────── */
function SBIArrestModal({ onClose, studentName }: { onClose: () => void; studentName: string }) {
  const caseNo = `SBI-${Date.now().toString().slice(-6)}`;
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md animate-bounce-once">
        {/* Red flashing border */}
        <div className="absolute inset-0 rounded-3xl border-4 border-red-500 animate-pulse" />

        <div className="relative bg-[#0a0a0a] rounded-3xl overflow-hidden shadow-2xl shadow-red-900/50">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-900 via-red-700 to-red-900 px-6 py-4 flex items-center justify-between border-b border-red-500/50">
            <div className="flex items-center gap-3">
              <div className="text-4xl animate-pulse">🚨</div>
              <div>
                <p className="text-red-200 text-[10px] font-black uppercase tracking-[0.3em]">Official Notice</p>
                <p className="text-white font-black text-lg leading-none">STHARA BUREAU OF INVESTIGATION</p>
                <p className="text-red-300 text-[10px] font-bold">Dept. of Digital Misconduct & Grammar Crimes</p>
              </div>
            </div>
            <div className="text-5xl">⚖️</div>
          </div>

          {/* Badge */}
          <div className="flex justify-center py-5">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-900/50 border-4 border-amber-300 animate-pulse">
                <div className="text-center">
                  <div className="text-4xl">🔍</div>
                  <p className="text-[8px] font-black text-amber-900 uppercase tracking-widest">SBI</p>
                </div>
              </div>
              <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full border border-red-400 animate-bounce">ACTIVE</div>
            </div>
          </div>

          {/* Arrest notice */}
          <div className="px-6 pb-2 space-y-3 text-center">
            <div className="bg-red-950/60 border border-red-700/50 rounded-2xl p-4">
              <p className="text-red-400 text-xs font-black uppercase tracking-widest mb-2">🚨 ARREST WARRANT #{caseNo} 🚨</p>
              <p className="text-white font-black text-xl mb-1">{studentName || 'SUSPECT'}</p>
              <p className="text-red-300 text-sm font-bold">YOU HAVE BEEN CAUGHT RED-HANDED!</p>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 text-left space-y-2">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">📋 Charges Filed</p>
              <div className="space-y-1">
                {[
                  '• Section 420-SBI: Criminal use of foul language',
                  '• Section 69-STHR: Attempted corruption of AI Tutor',
                  '• Section 1337: Digital misconduct in a school zone',
                ].map((charge, i) => (
                  <p key={i} className="text-red-300 text-xs font-mono">{charge}</p>
                ))}
              </div>
            </div>

            <div className="bg-amber-950/40 border border-amber-700/40 rounded-2xl p-4">
              <p className="text-amber-400 text-xs font-black uppercase tracking-widest mb-1">⚖️ Sentence Declared</p>
              <p className="text-white font-black text-2xl">100 YEARS</p>
              <p className="text-amber-300 text-sm font-bold">in Sthara Maximum Security Jail 🏛️</p>
              <p className="text-amber-500/70 text-[10px] mt-1">(WiFi not included. No YouTube allowed.)</p>
            </div>

            <div className="bg-red-950/40 border border-red-800/40 rounded-2xl p-3">
              <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-1">🔥 Additional Penalty</p>
              <p className="text-white font-bold text-sm">FIRED as Sthara Tester</p>
              <p className="text-red-400 text-[10px]">Badge confiscated. Access revoked. Reputation: destroyed.</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 space-y-3">
            <button
              onClick={onClose}
              className="w-full py-3 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-black rounded-2xl transition-all text-sm border border-red-500/50 shadow-lg"
            >
              {countdown > 0
                ? `😭 I CONFESS! Release me in ${countdown}s...`
                : '🙏 I PROMISE TO BEHAVE — Let me go!'}
            </button>
            <p className="text-center text-gray-600 text-[10px] font-mono">
              This is a test environment prank. No actual jails or firings occurred. Probably. — SBI HQ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt?: any;
}

function YouTubeSearchWidget({ query }: { query: string }) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getAuthToken().then(authToken => {
      fetch(`/api/youtube?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
        .then(async res => {
          if (!res.ok) { if (isMounted) setError(true); return null; }
          return res.json();
        })
        .then(data => {
          if (!data || !isMounted) return;
          if (data.videos) setVideos(data.videos);
          else setError(true);
        })
        .catch(() => { if (isMounted) setError(true); })
        .finally(() => { if (isMounted) setLoading(false); });
    });
    return () => { isMounted = false; };
  }, [query]);


  if (loading) return <div className="flex space-x-2 my-4 items-center text-sm text-[#002147]/60"><Loader2 className="w-4 h-4 animate-spin" /><span>Searching for videos about "{query}"...</span></div>;
  if (error || videos.length === 0) return <div className="flex space-x-2 my-4 items-center text-sm text-red-500"><AlertTriangle className="w-4 h-4" /><span>Could not load videos for "{query}".</span></div>;

  return (
    <div className="flex flex-col space-y-4 my-4">
      <div className="text-sm font-semibold text-[#002147] flex items-center space-x-2">
        <PlayCircle className="w-4 h-4 text-red-600" />
        <span>Top Results for "{query}"</span>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {videos.map(v => (
          <a key={v.videoId} href={v.url} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-xl border border-[#002147]/10 sm:w-80 shadow-sm hover:shadow-md transition-all">
            <img src={v.thumbnail} alt={v.title} className="w-full h-auto object-cover aspect-video group-hover:scale-105 transition-transform duration-500" />
            <span className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <span className="w-14 h-14 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
            <span className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent block">
              <span className="text-white text-sm font-bold line-clamp-2 leading-tight shadow-sm block">{v.title}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function StudentAITutor() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDBReady, setIsDBReady] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [showSBIArrest, setShowSBIArrest] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Is this a test account? Check EMAIL (not uid — uid is a random Firebase string)
  // Matches: teststu1@gmail.com, teststu2@gmail.com, tstteach@..., etc.
  const isTestAccount =
    profile?.email?.toLowerCase().startsWith('teststu') ||
    profile?.email?.toLowerCase().startsWith('tstteach') ||
    profile?.email?.toLowerCase().startsWith('testteach') ||
    profile?.uid?.toLowerCase().startsWith('testst') ||
    profile?.uid?.toLowerCase().startsWith('tstteach');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Listen to Firestore for lifetime chat history
  useEffect(() => {
    if (!profile?.uid) return;

    const messagesRef = collection(db, 'student_chats', profile.uid, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];

      if (fetchedMessages.length === 0 && !isTyping) {
        // Show chat immediately, try to seed greeting in background
        setIsDBReady(true);
        setMessages([{
          id: 'welcome',
          role: 'model',
          text: "Hi there! I'm your Sthara AI Tutor. What subject are we studying today? I can help explain concepts, check your reasoning, or quiz you!",
        }]);
        // Try to persist greeting (may fail if Firestore rules restrict it)
        addDoc(messagesRef, {
          role: 'model',
          text: "Hi there! I'm your Sthara AI Tutor. What subject are we studying today? I can help explain concepts, check your reasoning, or quiz you!",
          createdAt: serverTimestamp()
        }).catch(e => console.warn("Could not persist greeting:", e));

      } else {
        setMessages(fetchedMessages);
        setIsDBReady(true);
      }
    }, (err) => {
      // If Firestore permission denied, still show the chat with a local welcome
      console.warn('Firestore chat read error:', err);
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: "Hi there! I'm your Sthara AI Tutor. What subject are we studying today?",
      }]);
      setIsDBReady(true);
    });

    return () => unsubscribe();
  }, [profile?.uid]);


  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping || !profile?.uid) return;

    const userMsg = input.trim();
    setInput('');
    setErrorMsg('');
    setIsTyping(true);

    // Immediately show user message locally (don't wait for Firestore)
    const tempUserMsg: ChatMessage = { id: `local-${Date.now()}`, role: 'user', text: userMsg };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const messagesRef = collection(db, 'student_chats', profile.uid, 'messages');
      
      // 1. Save user message to Firestore (non-blocking — don't await)
      addDoc(messagesRef, {
        role: 'user',
        text: userMsg,
        createdAt: serverTimestamp()
      }).catch(e => console.warn('Could not save user message to Firestore:', e));

      // 2. Build context payload (cap to last 30 messages to save API limits)
      const contextMessages = [...messages.slice(-30), { role: 'user', text: userMsg }];
      
      // 3. Call AI Backend with auth token
      const authToken = await getAuthToken();
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: contextMessages.map(m => ({ sender: m.role, text: m.text })),
          studentId: profile.uid,
          studentName: profile.name || profile.email,
          studentClass: profile.studentClass || 'General',
          schoolId: profile.schoolId,
          violationCount,
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.text) {
        // Handle foul language warning
        if (data.isFoulWarning) {
          setViolationCount(data.newViolationCount || violationCount + 1);

          // 🚨 TEST ACCOUNTS: Show the SBI Arrest Modal instead of the normal warning
          if (isTestAccount) {
            setShowSBIArrest(true);
            setIsTyping(false);
            return; // Don't save warning to chat, just show the modal
          }

          // Real students: Show the polite warning locally + try to save
          const warnMsg: ChatMessage = { id: `warn-${Date.now()}`, role: 'model', text: data.text };
          setMessages(prev => [...prev, warnMsg]);
          addDoc(messagesRef, { role: 'model', text: data.text, createdAt: serverTimestamp() })
            .catch(e => console.warn('Could not save warning to Firestore:', e));

          // If teacher needs to be notified (2nd offense)
          if (data.notifyTeacher && profile.schoolId) {
            try {
              await addDoc(
                collection(db, 'schools', profile.schoolId, 'notifications'),
                {
                  type: 'foul_language',
                  title: '⚠️ Student Misconduct Alert',
                  message: `${data.studentName || profile.name} (${data.studentClass || profile.studentClass}) used inappropriate language in the AI Tutor — 2nd offense.`,
                  studentId: profile.uid,
                  studentName: profile.name,
                  studentClass: profile.studentClass,
                  read: false,
                  createdAt: serverTimestamp(),
                }
              );
            } catch (e) {
              console.warn('Could not send teacher notification:', e);
            }
          }
        } else {
          // 4. Show AI Response locally + try to save to Firestore
          const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: 'model', text: data.text };
          setMessages(prev => [...prev, aiMsg]);
          addDoc(messagesRef, { role: 'model', text: data.text, createdAt: serverTimestamp() })
            .catch(e => console.warn('Could not save AI response to Firestore:', e));
        }

      } else {
        console.error('AI Error:', data.error);
        setErrorMsg(data.error || 'Failed to connect to AI. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not reach the AI server. Please check your connection and try again.');
    } finally {
      setIsTyping(false);
    }
  };

  if (loading || !profile || !isDBReady) return <div className="p-10 text-[#002147] text-center font-medium">Loading Lifetime Chat History...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto py-8 px-4 h-[calc(100vh-80px)] flex flex-col">

      {/* 🚨 SBI Arrest Modal — test accounts only */}
      {showSBIArrest && (
        <SBIArrestModal
          studentName={profile.name || profile.email || 'SUSPECT'}
          onClose={() => setShowSBIArrest(false)}
        />
      )}

      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="flex items-center space-x-4">
          <Link href="/student" className="p-2 bg-white rounded-full border border-[#002147]/10 hover:bg-[#f8fafc] transition-colors text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-[#002147] flex items-center space-x-3">
              <Sparkles className="w-8 h-8 text-blue-500" />
              <span>Sthara Interactive Tutor</span>
            </h1>
            <p className="text-[#002147]/60 mt-1">Powered by Google Gemini 2.5 Flash</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center space-x-3 border border-red-100 shrink-0">
          <AlertTriangle className="w-5 h-5" />
          <p className="font-medium text-sm">{errorMsg}</p>
        </div>
      )}

      <div className="flex-1 bg-white border border-[#002147]/10 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f8fafc]">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-[#002147] ml-3' : 'bg-gradient-to-br from-blue-500 to-indigo-600 mr-3'}`}>
                  {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
                </div>
                <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-[#002147] text-white rounded-br-sm' 
                    : 'bg-white border border-[#002147]/10 text-[#002147] rounded-bl-sm prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-[#002147] prose-a:text-blue-600'
                }`}>
                  {msg.role === 'user' ? (
                    msg.text
                  ) : (
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        a: ({ node, ...props }) => {
                          const href = props.href || '';
                          
                          if (href.startsWith('https://ytsearch.local/?q=')) {
                            const query = decodeURIComponent(href.split('?q=')[1]);
                            return <YouTubeSearchWidget query={query} />;
                          }

                          const match = href.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                          const videoId = match ? match[1] : null;
                          
                          if (videoId) {
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="block my-4 group relative overflow-hidden rounded-xl border border-[#002147]/10 sm:w-80 shadow-sm hover:shadow-md transition-all">
                                <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="YouTube Video Thumbnail" className="w-full h-auto object-cover aspect-video group-hover:scale-105 transition-transform duration-500" />
                                <span className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                  <span className="w-14 h-14 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                  </span>
                                </span>
                                <span className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent block">
                                  <span className="text-white text-sm font-bold line-clamp-2 leading-tight shadow-sm block">{props.children}</span>
                                </span>
                              </a>
                            );
                          }
                          return <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" />;
                        }
                      }}
                    >
                      {msg.text.replace(/\[YOUTUBE_SEARCH:\s*([^\]]+)\]/g, (match, p1) => `[YOUTUBE_SEARCH](https://ytsearch.local/?q=${encodeURIComponent(p1)})`)}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex max-w-[80%] flex-row items-end">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600 mr-3">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#002147]/10 text-[#002147] rounded-bl-sm shadow-sm flex space-x-1 items-center h-12">
                  <div className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endOfMessagesRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-[#002147]/10 shrink-0">
          <form onSubmit={handleSendMessage} className="relative flex items-center max-w-4xl mx-auto">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about your studies..."
              className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-full pl-6 pr-14 py-4 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-inner"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 top-2 bottom-2 w-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:hover:bg-blue-500 shadow-sm"
            >
              <Send className="w-4 h-4 ml-1" />
            </button>
          </form>
          <div className="text-center mt-3 text-xs text-[#002147]/40 font-medium">
            AI can make mistakes. Please verify important information with your teacher.
          </div>
        </div>
      </div>
    </div>
  );
}
