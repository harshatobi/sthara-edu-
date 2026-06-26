import { Check, X, AlertCircle, AlertTriangle } from 'lucide-react';

export interface Step {
  type: 'correct' | 'logic_error' | 'procedural_error';
  text: string;
  explanation?: string;
  penalty?: number;
}

export interface Question {
  questionText: string;
  steps: Step[];
  finalAnswer: string;
  isFinalAnswerCorrect: boolean;
  aiCorrectedSolution?: string[];
}

export interface AiResult {
  questions: Question[];
  totalScore: number;
  maxTotalScore: number;
  summary: string;
  weaknessTags?: string[];
}

export default function AiEvaluationView({ scanResult }: { scanResult: AiResult }) {
  if (!scanResult || !scanResult.questions) return null;

  return (
    <div className="w-full bg-[#f4f4f0] shadow-xl rounded-md relative z-10" style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #cbd5e1 31px, #cbd5e1 32px)', backgroundPositionY: '40px' }}>
      <div className="p-6 md:p-12 text-[#111] font-mono text-base md:text-lg space-y-16">
        
        {scanResult.questions.map((q: Question, i: number) => (
          <div key={i}>
            <div className="font-bold text-xl mb-6">Q{i+1}: {q.questionText}</div>
            
            <div className="space-y-6">
              {q.steps?.map((step: Step, j: number) => (
                <div key={j} className="flex flex-col md:flex-row items-start justify-between gap-4">
                  {/* Correct Step */}
                  {step.type === 'correct' && (
                    <div className="md:ml-6 leading-loose text-blue-900/80 flex flex-col md:flex-row items-start md:items-center space-y-2 md:space-y-0 md:space-x-4 w-full">
                      <div className="flex-1 overflow-x-auto w-full">{step.text}</div>
                      <div className="flex items-center space-x-2 text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200 shrink-0 self-start md:self-auto">
                        <Check className="w-5 h-5 font-bold" />
                        <span className="font-sans text-sm font-bold tracking-wide">Verified</span>
                      </div>
                    </div>
                  )}

                  {/* Logic Error Step */}
                  {step.type === 'logic_error' && (
                    <div className="md:ml-6 flex flex-col md:flex-row items-start gap-4 md:gap-8 w-full">
                      <div className="flex-1 w-full bg-red-500/5 border-2 border-[#dc143c]/40 rounded-lg p-4 leading-loose text-blue-900/80 relative overflow-x-auto">
                        <div className="absolute -top-3 -right-3 bg-[#dc143c] text-white p-1 rounded-full shadow-lg">
                          <X className="w-4 h-4" />
                        </div>
                        <span className="text-[#dc143c] font-bold line-through decoration-2 whitespace-nowrap">{step.text}</span>
                      </div>
                      <div className="flex-1 w-full bg-white border border-[#002147]/10 p-5 rounded-xl shadow-sm relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-[#dc143c]"></div>
                        <div className="flex items-center space-x-2 text-[#dc143c] font-bold uppercase tracking-wider text-xs mb-2">
                          <AlertCircle className="w-4 h-4" /> Logic Error
                        </div>
                        <p className="font-sans text-[#002147] text-sm leading-relaxed mb-3">
                          {step.explanation}
                        </p>
                        {step.penalty !== undefined && step.penalty > 0 && (
                          <div className="inline-flex text-[#dc143c] font-bold bg-[#dc143c]/10 px-3 py-1 rounded">
                            -{step.penalty} Penalty
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Procedural Error Step */}
                  {step.type === 'procedural_error' && (
                    <div className="md:ml-6 flex flex-col md:flex-row items-start gap-4 md:gap-8 w-full">
                      <div className="flex-1 w-full bg-orange-500/5 border-2 border-orange-500/40 rounded-lg p-4 leading-loose text-blue-900/80 relative overflow-x-auto">
                        <div className="absolute -top-3 -right-3 bg-orange-500 text-white p-1 rounded-full shadow-lg">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <span className="text-orange-700 font-bold whitespace-nowrap">{step.text}</span>
                      </div>
                      <div className="flex-1 w-full bg-white border border-[#002147]/10 p-5 rounded-xl shadow-sm relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-orange-500"></div>
                        <div className="flex items-center space-x-2 text-orange-600 font-bold uppercase tracking-wider text-xs mb-2">
                          <AlertTriangle className="w-4 h-4" /> Procedural Error
                        </div>
                        <p className="font-sans text-[#002147] text-sm leading-relaxed mb-3">
                          {step.explanation}
                        </p>
                        {step.penalty !== undefined && step.penalty > 0 && (
                          <div className="inline-flex text-orange-600 font-bold bg-orange-500/10 px-3 py-1 rounded">
                            -{step.penalty} Penalty
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Final Answer */}
              <div className="md:ml-6 mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <span className="font-bold text-black border-2 border-blue-500/30 px-3 py-1 bg-blue-500/10 rounded break-all">Answer: {q.finalAnswer}</span>
                {q.isFinalAnswerCorrect ? (
                   <div className="inline-flex items-center text-sm font-bold text-green-600 bg-green-50 px-3 py-1 border border-green-200 rounded shrink-0">
                     Correct Final Answer
                   </div>
                ) : (
                   <div className="inline-flex items-center text-sm font-bold text-[#dc143c] bg-[#dc143c]/5 px-3 py-1 border border-[#dc143c]/20 rounded shrink-0">
                     Incorrect Final Answer
                   </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Final Solution Breakout Box */}
        <div className="mt-12 bg-[#002147] text-white p-6 md:p-8 rounded-xl shadow-lg border border-[#002147]/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/20 blur-3xl pointer-events-none"></div>
          <h4 className="font-sans font-bold text-blue-300 uppercase tracking-widest text-sm mb-6">AI Corrected Solutions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {scanResult.questions.map((q: Question, i: number) => (
              <div key={i}>
                <div className="font-bold text-blue-300 mb-2">Q{i+1} Correct Method</div>
                <div className="font-mono leading-loose text-white/90 overflow-x-auto">
                  {q.aiCorrectedSolution?.map((line: string, j: number) => (
                    <div key={j} className="whitespace-nowrap">{line}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
