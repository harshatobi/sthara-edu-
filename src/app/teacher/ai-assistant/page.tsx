'use client';

import { useState } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function TeacherAIAssistant() {
  const [messages, setMessages] = useState<{ sender: 'ai' | 'teacher', text: string }[]>([
    { sender: 'ai', text: 'Hello! I am your AI Teaching Assistant. How can I help you plan your lesson or assist with grading today?' }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const { profile } = useAuth();

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessages = [...messages, { sender: 'teacher' as const, text: inputMessage }];
    setMessages(newMessages);
    setInputMessage("");
    setIsTyping(true);

    try {
      const response = await fetch('/api/teacher/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          teacherContext: { class: profile?.teacherClass }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.text) {
        setMessages(prev => [...prev, { sender: 'ai', text: data.text }]);
      } else {
        setMessages(prev => [...prev, { sender: 'ai', text: `Error: ${data.error || 'Failed to parse'}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Sorry, I am having trouble connecting right now.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in duration-500 max-w-4xl mx-auto w-full">
      <div className="bg-white p-6 rounded-t-2xl shadow-sm border border-[#002147]/10 flex items-center justify-between z-10 relative">
        <div className="flex items-center space-x-3">
          <div className="bg-[#002147] p-2 rounded-xl">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#002147]">AI Teaching Assistant</h2>
            <p className="text-[#002147]/60 text-sm">Lesson planning, analytics, and ideas.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8fafc] border-x border-[#002147]/10 p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'ai' ? 'justify-start' : 'justify-end'}`}>
            <div className={`flex max-w-[80%] items-start space-x-3 ${msg.sender === 'teacher' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${msg.sender === 'ai' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#002147] text-white'}`}>
                {msg.sender === 'ai' ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
              </div>

              <div className={`p-4 rounded-2xl shadow-sm ${
                msg.sender === 'ai' 
                  ? 'bg-white border border-[#002147]/10 text-[#002147] rounded-tl-none' 
                  : 'bg-[#002147] text-white rounded-tr-none'
              }`}>
                {msg.text}
              </div>

            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div className="bg-white border border-[#002147]/10 p-4 rounded-2xl rounded-tl-none shadow-sm flex space-x-2">
                <div className="w-2 h-2 bg-[#002147]/40 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-[#002147]/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-[#002147]/40 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-b-2xl shadow-sm border border-[#002147]/10 flex items-center space-x-3">
        <input 
          type="text" 
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask for lesson ideas, homework generation..."
          className="flex-1 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#002147]/20 text-[#002147]"
        />
        <button 
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || isTyping}
          className="bg-[#002147] text-white p-3 rounded-xl hover:bg-[#002147]/90 transition-colors disabled:opacity-50"
        >
          <Send className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
