import { Check, X, Edit3, ZoomIn } from 'lucide-react';

export default function GradingGalleryPage() {
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#002147]">Grading Gallery</h2>
          <p className="text-[#002147]/60">Rapidly approve/edit AI-suggested marks and logic corrections.</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-[#002147]/60">Pending Scans</div>
          <div className="text-2xl font-bold text-[#dc143c]">14</div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Main Review Area */}
        <div className="flex-1 bg-white rounded-2xl border border-[#002147]/10 shadow-sm flex flex-col overflow-hidden">
          <div className="bg-[#f8fafc] border-b border-[#002147]/10 p-4 flex justify-between items-center">
            <div className="font-semibold text-[#002147]">Submission: Aryan K. (Math HW 4)</div>
            <button className="p-2 hover:bg-white rounded-lg text-[#002147]/60 hover:text-[#002147] transition-colors">
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 bg-[#001229] relative overflow-hidden flex items-center justify-center p-8">
            {/* Mock Student Scan Image Placeholder */}
            <div className="w-full max-w-2xl bg-[#f4f4f0] aspect-[1/1.4] shadow-2xl relative" style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #cbd5e1 31px, #cbd5e1 32px)', backgroundPositionY: '40px' }}>
              <div className="absolute top-12 left-12 right-12 text-[#002147] font-mono text-lg space-y-8">
                <div>
                  <div className="font-bold">Q1: Solve 2x² - 5x + 3 = 0</div>
                  <div className="mt-4 ml-4">
                    2x² - 2x - 3x + 3 = 0 <br/>
                    2x(x - 1) - 3(x - 1) = 0 <br/>
                    (2x - 3)(x - 1) = 0 <br/>
                    x = 3/2, x = 1
                  </div>
                </div>
                
                {/* AI Margin Note Overlay */}
                <div className="absolute top-20 -right-8 max-w-[200px] transform rotate-2">
                  <div className="relative">
                    <svg className="absolute -left-12 top-2 w-10 h-10 text-[#dc143c]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    <div className="font-handwriting text-[#dc143c] text-xl font-bold leading-tight bg-white/80 p-2 rounded-lg border border-[#dc143c]/20 backdrop-blur-sm">
                      Perfect factorization! Step-by-step logic is flawless. <br/>+5/5
                    </div>
                  </div>
                </div>

                <div className="mt-16">
                  <div className="font-bold">Q2: Solve x² - 4x - 5 = 0</div>
                  <div className="mt-4 ml-4">
                    x = [4 ± √(16 - 20)] / 2 <br/>
                    x = [4 ± √(-4)] / 2 <br/>
                  </div>
                </div>

                {/* AI Margin Note Overlay 2 */}
                <div className="absolute bottom-32 -right-8 max-w-[250px] transform -rotate-1">
                  <div className="relative">
                    <svg className="absolute -left-12 top-2 w-10 h-10 text-[#dc143c]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    <div className="font-handwriting text-[#dc143c] text-xl font-bold leading-tight bg-white/80 p-2 rounded-lg border border-[#dc143c]/20 backdrop-blur-sm">
                      Sign error here! <br/>c = -5, so -4ac = +20. <br/>Root is √(36), not √(-4). <br/>+2/5
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="w-80 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-[#002147]/10 shadow-sm">
            <h3 className="font-bold text-[#002147] mb-4">AI Evaluation Summary</h3>
            <div className="text-4xl font-bold text-center text-[#002147] mb-2">7 / 10</div>
            <div className="text-center text-[#dc143c] text-sm font-medium mb-6">Needs review on Q2</div>
            
            <div className="space-y-3">
              <button className="w-full bg-[#002147] text-white px-4 py-3 rounded-xl font-medium hover:bg-[#002147]/90 transition-colors flex items-center justify-center space-x-2">
                <Check className="w-5 h-5" />
                <span>Approve Grade</span>
              </button>
              <button className="w-full bg-white border border-[#002147]/20 text-[#002147] px-4 py-3 rounded-xl font-medium hover:bg-[#002147]/5 transition-colors flex items-center justify-center space-x-2">
                <Edit3 className="w-5 h-5" />
                <span>Edit Marks</span>
              </button>
              <button className="w-full bg-white border border-[#dc143c]/20 text-[#dc143c] px-4 py-3 rounded-xl font-medium hover:bg-[#dc143c]/5 transition-colors flex items-center justify-center space-x-2">
                <X className="w-5 h-5" />
                <span>Reject & Request Resubmission</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#002147]/10 shadow-sm flex-1 overflow-y-auto">
            <h3 className="font-bold text-[#002147] mb-4">Queue (13 left)</h3>
            <div className="space-y-2">
              {['Priya S.', 'Rahul V.', 'Sneha M.', 'Rohan D.'].map((name, i) => (
                <div key={i} className="p-3 bg-[#f8fafc] rounded-xl border border-[#002147]/5 hover:border-[#002147]/20 cursor-pointer transition-colors flex justify-between items-center">
                  <span className="font-medium text-[#002147]">{name}</span>
                  <span className="text-xs font-mono text-[#002147]/40 bg-white px-2 py-1 rounded">Pending</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
