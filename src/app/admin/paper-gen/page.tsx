'use client';

import { useState } from 'react';
import { Settings, FileText, CheckCircle2, Loader2 } from 'lucide-react';

export default function PaperGenPage() {
  const [generating, setGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [error, setError] = useState('');

  const [grade, setGrade] = useState('10th Grade Mathematics');
  const [difficulty, setDifficulty] = useState('CBSE Standard (30% Easy, 50% Med, 20% Hard)');
  const [chapters, setChapters] = useState<string[]>(['Quadratic Equations']);

  const toggleChapter = (chapter: string) => {
    setChapters(prev => 
      prev.includes(chapter) 
        ? prev.filter(c => c !== chapter)
        : [...prev, chapter]
    );
  };

  const handleGenerate = async () => {
    if (chapters.length === 0) {
      setError("Please select at least one chapter.");
      return;
    }
    setError('');
    setGenerating(true);
    setGeneratedData(null);
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        setError("API Key missing");
        setGenerating(false);
        return;
      }

      const prompt = `Generate a quiz for ${grade} covering chapters: ${chapters.join(', ')}. 
      Difficulty: ${difficulty}. 
      Generate exactly 3 multiple choice questions.
      Return the result as a strict JSON array of objects, where each object has:
      - "id": a unique string (e.g. "q1")
      - "text": the question text
      - "options": an array of exactly 4 objects, each with "id" ("a", "b", "c", or "d") and "text"
      - "correctOptionId": the id of the correct option.
      Do not include any markdown formatting, just the raw JSON.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.candidates && data.candidates.length > 0) {
        const textResponse = data.candidates[0].content.parts[0].text;
        try {
          const parsed = JSON.parse(textResponse);
          setGeneratedData(parsed);
        } catch (e) {
          setError('Failed to parse Gemini response.');
        }
      } else {
        setError(data.error?.message || 'Failed to generate paper.');
      }
    } catch (err) {
      setError('Connection error.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500">
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Instant Paper Gen</h2>
          <p className="text-[#002147]/60 mt-1">Generate professional, AI-powered quizzes aligned with your syllabus.</p>
        </div>

        <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#002147]">Grade / Subject</label>
              <select 
                value={grade}
                onChange={e => setGrade(e.target.value)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              >
                <option>10th Grade Mathematics</option>
                <option>10th Grade Science</option>
                <option>9th Grade Mathematics</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#002147]">Difficulty Distribution</label>
              <select 
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              >
                <option>CBSE Standard (30% Easy, 50% Med, 20% Hard)</option>
                <option>Challenge Mode (10% Easy, 40% Med, 50% Hard)</option>
                <option>Foundational (50% Easy, 40% Med, 10% Hard)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-[#002147]">Select Chapters</label>
            <div className="grid grid-cols-2 gap-3">
              {['Real Numbers', 'Polynomials', 'Quadratic Equations', 'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry'].map(chapter => (
                <label key={chapter} className="flex items-center space-x-3 p-3 border border-[#002147]/10 rounded-xl hover:bg-[#f8fafc] cursor-pointer transition-colors">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 text-[#dc143c] border-[#002147]/20 rounded focus:ring-[#dc143c]" 
                    checked={chapters.includes(chapter)}
                    onChange={() => toggleChapter(chapter)}
                  />
                  <span className="text-[#002147] font-medium">{chapter}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-[#dc143c] font-medium">{error}</p>}

          <button 
            onClick={handleGenerate}
            disabled={generating}
            className="w-full bg-[#002147] text-white py-4 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors flex items-center justify-center space-x-2 disabled:opacity-70"
          >
            {generating ? (
              <><Loader2 className="w-5 h-5 animate-spin" /><span>Generating via Gemini AI...</span></>
            ) : (
              <><Settings className="w-5 h-5" /><span>Generate Live Quiz</span></>
            )}
          </button>
        </div>
      </div>

      <div className="lg:w-[450px]">
        {generatedData ? (
          <div className="bg-[#dc143c] text-white p-6 rounded-2xl shadow-xl space-y-6 animate-in slide-in-from-right-8 duration-500 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-center mb-6">
              <div className="bg-white/20 p-4 rounded-full">
                <CheckCircle2 className="w-16 h-16 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">Quiz Generated!</h3>
              <p className="text-white/80 text-sm">Powered by Gemini 2.5 Flash</p>
            </div>
            
            <div className="space-y-4 mt-6">
              {generatedData.map((q: any, i: number) => (
                <div key={q.id} className="bg-white/10 p-4 rounded-xl">
                  <p className="font-bold mb-2 text-sm">Q{i + 1}: {q.text}</p>
                  <ul className="space-y-1">
                    {q.options.map((opt: any) => (
                      <li key={opt.id} className={`text-xs p-2 rounded-lg ${opt.id === q.correctOptionId ? 'bg-white/30 font-bold border border-white' : 'bg-white/5'}`}>
                        {opt.id.toUpperCase()}) {opt.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button className="w-full bg-white text-[#dc143c] py-3 rounded-xl font-bold hover:bg-white/90 transition-colors flex items-center justify-center space-x-2 shadow-lg mt-6">
              <FileText className="w-5 h-5" />
              <span>Save as Assignment</span>
            </button>
          </div>
        ) : (
          <div className="h-full bg-[#f8fafc] border-2 border-dashed border-[#002147]/10 rounded-2xl flex flex-col items-center justify-center text-[#002147]/40 p-8 text-center min-h-[400px]">
            <FileText className="w-16 h-16 mb-4" />
            <p>Configure parameters on the left to generate a live, AI-powered quiz.</p>
          </div>
        )}
      </div>
    </div>
  );
}
