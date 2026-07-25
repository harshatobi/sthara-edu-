'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowLeft, Send, Loader2, Copy, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function TeacherAiAssistant() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am your AI Teaching Assistant. How can I help you draft lesson plans, create assignments, or generate quizzes today?',
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          subject: profile?.teacherSubject || 'General',
        }),
      });

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'Here is the generated response for your request.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('[ai-assistant] error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your request.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading AI Assistant...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Teacher AI Co-Pilot</h1>
          <p className="text-gray-500 text-sm mt-1">Draft lesson plans, generate assignments, and formulate question papers</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4 flex flex-col h-[650px]">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#002147] text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200/60'
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center space-x-3 pt-2 border-t border-gray-100">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask AI to generate a quiz, lesson plan, or assignment..."
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={isSending || !input.trim()}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all shadow-md disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
