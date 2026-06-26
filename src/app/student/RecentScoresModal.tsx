'use client';

import { useState } from 'react';
import { X, CheckCircle2, TrendingUp, Award, BookOpen, Calendar as CalendarIcon, FileText, Activity } from 'lucide-react';

interface ScoreEntry {
  id: string;
  title: string;
  subject: string;
  type: 'Quiz' | 'Test' | 'Homework' | 'Project';
  score: string;
  numericScore: number;
  date: string;
  feedback: string;
}

const mockHistory: ScoreEntry[] = [
  { id: 'h1', title: 'Quadratic Equations Final', subject: 'Mathematics', type: 'Test', score: 'A-', numericScore: 92, date: '2026-06-20', feedback: 'Great understanding of roots. Review the discriminant for next time.' },
  { id: 'h2', title: 'Chemical Bonding Check', subject: 'Science', type: 'Quiz', score: 'B+', numericScore: 88, date: '2026-06-18', feedback: 'Solid grasp on covalent bonds. Ionic bonding needs a bit more review.' },
  { id: 'h3', title: 'Poetry Analysis Essay', subject: 'English', type: 'Project', score: 'A+', numericScore: 98, date: '2026-06-15', feedback: 'Exceptional analysis and brilliant use of vocabulary. Flawless structure.' },
  { id: 'h4', title: 'Polynomials Practice', subject: 'Mathematics', type: 'Homework', score: 'C', numericScore: 75, date: '2026-06-12', feedback: 'Struggled with the Remainder Theorem. Recommended to re-watch the Chapter 2 videos.' },
  { id: 'h5', title: 'Life Processes Midterm', subject: 'Science', type: 'Test', score: 'A', numericScore: 94, date: '2026-06-10', feedback: 'Excellent diagram of the human heart! Perfect scores on the respiration section.' },
  { id: 'h6', title: 'Tenses and Grammar', subject: 'English', type: 'Quiz', score: 'A-', numericScore: 90, date: '2026-06-05', feedback: 'Perfect active/passive voice conversions. Missed one irregular verb.' },
  { id: 'h7', title: 'Coordinate Geometry Basics', subject: 'Mathematics', type: 'Homework', score: 'B', numericScore: 85, date: '2026-06-01', feedback: 'Good work on the distance formula. Make sure to double-check signs in the midpoint formula.' },
  { id: 'h8', title: 'Acids & Bases Lab Report', subject: 'Science', type: 'Project', score: 'A', numericScore: 95, date: '2026-05-28', feedback: 'Very thorough observation table. The conclusion was well-reasoned and accurate.' },
];

export default function RecentScoresModal({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<'All' | 'Mathematics' | 'Science' | 'English'>('All');

  const filteredHistory = filter === 'All' 
    ? mockHistory 
    : mockHistory.filter(h => h.subject === filter);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 80) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 70) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Test': return <Award className="w-4 h-4" />;
      case 'Project': return <FileText className="w-4 h-4" />;
      case 'Quiz': return <Activity className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-8 text-white relative shrink-0 overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <TrendingUp className="w-48 h-48" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold mb-4">
                <CheckCircle2 className="w-4 h-4" />
                <span>Academic History</span>
              </div>
              <h2 className="text-4xl font-extrabold tracking-tight mb-2">Recent Scores</h2>
              <p className="text-emerald-50 font-medium text-lg max-w-xl">
                Review your performance across all assignments, quizzes, and tests from the beginning of the term.
              </p>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-black/20 transition-all text-white backdrop-blur-md">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mt-8 relative z-10">
            {['All', 'Mathematics', 'Science', 'English'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-5 py-2 rounded-xl font-bold transition-all text-sm ${
                  filter === f 
                    ? 'bg-white text-emerald-600 shadow-md scale-105' 
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area - Timeline */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-gray-50/50">
          <div className="relative border-l-2 border-gray-200 ml-4 md:ml-6 space-y-8 pb-8">
            {filteredHistory.map((entry, idx) => (
              <div key={entry.id} className="relative pl-8 md:pl-10 animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                
                {/* Timeline Dot */}
                <div className={`absolute -left-[11px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                  entry.score.startsWith('A') ? 'bg-emerald-500' :
                  entry.score.startsWith('B') ? 'bg-blue-500' :
                  entry.score.startsWith('C') ? 'bg-orange-500' : 'bg-red-500'
                }`}></div>

                {/* Card */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-2 text-xs font-bold text-gray-400 mb-1">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>{new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <h3 className="text-xl font-bold text-[#002147] group-hover:text-emerald-600 transition-colors">{entry.title}</h3>
                      <div className="flex items-center space-x-3 mt-2 text-xs font-bold text-gray-500">
                        <span className="flex items-center space-x-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{entry.subject}</span>
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                        <span className="flex items-center space-x-1">
                          {getTypeIcon(entry.type)}
                          <span>{entry.type}</span>
                        </span>
                      </div>
                    </div>
                    
                    {/* Score Badge */}
                    <div className={`shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 ${getScoreColor(entry.numericScore)}`}>
                      <span className="text-3xl font-black">{entry.score}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{entry.numericScore}%</span>
                    </div>
                  </div>

                  {/* Feedback Snippet */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mt-2 text-sm text-gray-600">
                    <span className="font-bold text-gray-700 mr-2">AI Feedback:</span>
                    {entry.feedback}
                  </div>
                </div>
              </div>
            ))}

            {filteredHistory.length === 0 && (
              <div className="pl-8 text-center py-10">
                <p className="text-gray-500 font-medium">No records found for {filter}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
