import { Check, X, AlertCircle, AlertTriangle, PlayCircle, Tag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/* ── Convert LaTeX / programmer notation → readable Unicode math ── */
function cleanMath(text: string): string {
  if (!text) return text;
  return text
    .replace(/\\\\/g, '\n')
    .replace(/\\\(|\\\)/g, '')
    .replace(/\\\[|\\\]/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1⁄$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\sqrt/g, '√')
    // Superscripts: x^2 or x^{2}
    .replace(/\^\{2\}|\^2(?![\d.])/g, '²')
    .replace(/\^\{3\}|\^3(?![\d.])/g, '³')
    .replace(/\^\{4\}|\^4(?![\d.])/g, '⁴')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    // sqrt() function notation (not LaTeX)
    .replace(/sqrt\(([^)]+)\)/g, '√($1)')
    // Operators
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\geq|>=/g, '≥')
    .replace(/\\leq|<=/g, '≤')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\theta/g, 'θ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\([a-zA-Z])/g, '$1')
    .trim();
}


export interface Step {
  type: 'correct' | 'logic_error' | 'procedural_error';
  text: string;
  explanation?: string | null;
  penalty?: number;
}

export interface Question {
  questionText: string;
  steps: Step[];
  finalAnswer: string;
  isFinalAnswerCorrect: boolean;
  awardedScore?: number;
  maxScore?: number;
  aiCorrectedSolution?: string[];
}

export interface AiResult {
  questions: Question[];
  totalScore: number;
  maxTotalScore: number;
  summary: string;
  weaknessTags?: string[];
  recommendedVideos?: { title: string; duration: string }[];
}

function AnimatedScore({ value, max }: { value: number; max: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    const duration = 1200;
    const step = (timestamp: number, startTime: number) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setDisplay(Math.round(progress * end));
      if (progress < 1) requestAnimationFrame(ts => step(ts, startTime));
    };
    requestAnimationFrame(ts => step(ts, ts));
  }, [value]);

  const pct = max > 0 ? (display / max) * 100 : 0;
  const circumference = 2 * Math.PI * 70;
  const scoreColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#dc143c';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="70" stroke="#f1f5f9" strokeWidth="12" fill="transparent" />
          <circle
            cx="80" cy="80" r="70"
            stroke={scoreColor}
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * pct) / 100}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease-out, stroke 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black tracking-tighter" style={{ color: scoreColor }}>{display}</span>
          <span className="text-sm font-bold text-gray-400 mt-0.5">out of {max}</span>
        </div>
      </div>
      <div className="mt-3 text-sm font-bold px-4 py-1.5 rounded-full" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}>
        {pct >= 90 ? '🏆 Excellent' : pct >= 75 ? '✨ Good Job' : pct >= 60 ? '📈 Keep Going' : '⚠️ Needs Review'}
      </div>
    </div>
  );
}

export default function AiEvaluationView({ scanResult }: { scanResult: AiResult }) {
  if (!scanResult || !scanResult.questions) return null;

  const pct = scanResult.maxTotalScore > 0 ? (scanResult.totalScore / scanResult.maxTotalScore) * 100 : 0;

  return (
    <div className="w-full space-y-8 font-sans">

      {/* Score Hero + Summary */}
      <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 flex flex-col md:flex-row items-center gap-8">
        <AnimatedScore value={scanResult.totalScore} max={scanResult.maxTotalScore} />
        <div className="flex-1 space-y-4">
          <p className="text-gray-600 leading-relaxed text-base italic border-l-4 border-blue-500 pl-4">"{scanResult.summary}"</p>

          {/* Weakness Tags */}
          {scanResult.weaknessTags && scanResult.weaknessTags.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Areas to Improve
              </p>
              <div className="flex flex-wrap gap-2">
                {scanResult.weaknessTags.map((tag, i) => (
                  <span key={i} className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold capitalize">
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Videos */}
          {scanResult.recommendedVideos && scanResult.recommendedVideos.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                <PlayCircle className="w-3.5 h-3.5" /> Recommended Watchlist
              </p>
              <div className="space-y-1.5">
                {scanResult.recommendedVideos.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <PlayCircle className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-sm font-medium text-blue-900 flex-1">{v.title}</span>
                    <span className="text-xs text-blue-400 font-bold shrink-0">{v.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Question-by-Question Breakdown */}
      {scanResult.questions.map((q: Question, i: number) => {
        const qPct = (q.maxScore || 5) > 0 ? ((q.awardedScore || 0) / (q.maxScore || 5)) * 100 : 0;
        const qColor = qPct >= 80 ? 'emerald' : qPct >= 50 ? 'amber' : 'red';
        const colorMap: Record<string, string> = {
          emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          amber: 'bg-amber-50 text-amber-700 border-amber-200',
          red: 'bg-red-50 text-red-700 border-red-200',
        };

        return (
          <div key={i} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Question Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#002147] text-white flex items-center justify-center font-black text-sm shrink-0">
                  Q{i + 1}
                </div>
                <p className="font-bold text-[#002147] text-base leading-snug">{cleanMath(q.questionText)}</p>
              </div>
              {q.awardedScore !== undefined && (
                <div className={`shrink-0 ml-4 px-4 py-1.5 rounded-xl border font-black text-sm ${colorMap[qColor]}`}>
                  {q.awardedScore}/{q.maxScore || 5}
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="p-6 space-y-4 font-mono text-sm">
              {q.steps?.map((step: Step, j: number) => {
                if (step.type === 'correct') return (
                  <div key={j} className="flex items-start gap-3 group">
                    <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-gray-700 leading-relaxed flex-1">{cleanMath(step.text)}</span>
                    <span className="shrink-0 text-xs font-sans font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">Verified ✓</span>
                  </div>
                );

                if (step.type === 'logic_error') return (
                  <div key={j} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                        <X className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-red-600 line-through decoration-2 flex-1 leading-relaxed">{cleanMath(step.text)}</span>
                      {(step.penalty ?? 0) > 0 && (
                        <span className="shrink-0 text-xs font-sans font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          -{step.penalty}pts
                        </span>
                      )}
                    </div>
                    {step.explanation && (
                      <div className="ml-9 bg-red-50 border border-red-200 rounded-xl p-3 font-sans text-xs text-red-800 flex gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <span><strong>Logic Error:</strong> {cleanMath(step.explanation || '')}</span>
                      </div>
                    )}
                  </div>
                );

                if (step.type === 'procedural_error') return (
                  <div key={j} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-amber-700 flex-1 leading-relaxed">{cleanMath(step.text)}</span>
                      {(step.penalty ?? 0) > 0 && (
                        <span className="shrink-0 text-xs font-sans font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          -{step.penalty}pts
                        </span>
                      )}
                    </div>
                    {step.explanation && (
                      <div className="ml-9 bg-amber-50 border border-amber-200 rounded-xl p-3 font-sans text-xs text-amber-800 flex gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span><strong>Procedural Error:</strong> {cleanMath(step.explanation || '')}</span>
                      </div>
                    )}
                  </div>
                );
                return null;
              })}

              {/* Final Answer Row */}
              <div className="pt-4 mt-4 border-t border-gray-100 flex flex-wrap items-center gap-3 font-sans">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Final Answer:</span>
                <span className="font-mono font-bold text-[#002147] bg-gray-100 px-3 py-1 rounded-lg text-sm">{cleanMath(q.finalAnswer || '—')}</span>
                {q.isFinalAnswerCorrect ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">✓ Correct</span>
                ) : (
                  <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">✗ Incorrect</span>
                )}
              </div>
            </div>

            {/* AI Corrected Solution */}
            {q.aiCorrectedSolution && q.aiCorrectedSolution.length > 0 && (
              <div className="bg-[#002147] p-6 font-mono text-sm space-y-1.5">
                <p className="text-blue-300 text-xs font-sans font-bold uppercase tracking-widest mb-3">✦ AI Correct Method</p>
                {q.aiCorrectedSolution.map((line: string, k: number) => (
                  <div key={k} className="text-white/80 leading-relaxed">{cleanMath(line)}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
