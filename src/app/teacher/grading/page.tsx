'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { Check, X, Edit3, ZoomIn, Scan, AlertCircle, Clock, Activity, TrendingUp, AlertTriangle, Loader2, BrainCircuit } from 'lucide-react';
import AiEvaluationView from '@/components/AiEvaluationView';

interface Submission {
  id: string; // student uid
  assignmentId: string;
  assignmentTitle: string;
  studentName: string;
  customStudentId: string;
  attachmentUrl: string;
  aiGraded: boolean;
  aiResult?: any;
  teacherApproved?: boolean;
  score?: number;
}

export default function GradingGalleryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [queue, setQueue] = useState<Submission[]>([]);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [showAttachment, setShowAttachment] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    // Fetch all assignments and their submissions that are AI graded but not yet teacher approved
    const fetchQueue = async () => {
      try {
        const assignmentsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments'));
        const allPending: Submission[] = [];
        
        // Extract query params for targeted grading
        const params = new URLSearchParams(window.location.search);
        const focusStudentId = params.get('focus');
        const focusTaskId = params.get('task');
        
        for (const assignmentDoc of assignmentsSnap.docs) {
          const assignment = assignmentDoc.data();
          const submissionsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments', assignmentDoc.id, 'submissions'));
          
          submissionsSnap.forEach((subDoc) => {
            const subData = subDoc.data();
            const isFocused = focusStudentId === subDoc.id && focusTaskId === assignmentDoc.id;
            const isStandardQueue = subData.attachmentUrl && subData.aiGraded && !subData.teacherApproved;
            
            if (isFocused || isStandardQueue) {
              allPending.push({
                id: subDoc.id,
                assignmentId: assignmentDoc.id,
                assignmentTitle: assignment.title,
                studentName: subData.studentName || 'Unknown Student',
                customStudentId: subData.customStudentId || '',
                attachmentUrl: subData.attachmentUrl || '',
                aiGraded: subData.aiGraded || false,
                aiResult: subData.aiResult,
                score: subData.score
              });
            }
          });
        }
        
        setQueue(allPending);
        if (allPending.length > 0) {
          let target = allPending[0];
          if (focusStudentId && focusTaskId) {
             const found = allPending.find(p => p.id === focusStudentId && p.assignmentId === focusTaskId);
             if (found) target = found;
          }
          setActiveSubmission(target);
        }
      } catch (err) {
        console.error("Error fetching queue:", err);
      }
    };

    fetchQueue();
  }, [profile?.schoolId]);

  const handleApproveGrade = async () => {
    console.log("Approve grade clicked", activeSubmission, profile);
    if (!activeSubmission || !activeSubmission.aiResult || !profile?.schoolId) {
      alert("Missing activeSubmission or profile data!");
      return;
    }
    
    try {
      // Mark as teacher approved
      const subRef = doc(db, 'schools', profile.schoolId, 'assignments', activeSubmission.assignmentId, 'submissions', activeSubmission.id);
      await setDoc(subRef, {
        teacherApproved: true
      }, { merge: true });

      // Remove from queue
      const newQueue = queue.filter(q => q.id !== activeSubmission.id);
      setQueue(newQueue);
      setActiveSubmission(newQueue.length > 0 ? newQueue[0] : null);
      setShowAttachment(false);
      alert("Grade approved successfully!");
    } catch (err: any) {
      console.error("Error saving grade:", err);
      alert("Failed to save grade: " + err.message);
    }
  };

  if (loading || !profile) return <div className="p-10">Loading Engine...</div>;

  const scanResult = activeSubmission?.aiResult;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#002147]/5 flex justify-between items-center relative overflow-hidden shrink-0">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[#dc143c] to-[#ff4757]"></div>
        <div className="pl-4">
          <h2 className="text-3xl font-extrabold text-[#002147] tracking-tight">Diagnostic Engine <span className="text-[#dc143c] font-light">| Gallery</span></h2>
          <p className="text-[#002147]/60 font-medium mt-1">High-speed AI evaluation & logic correction review.</p>
        </div>
        <div className="text-right flex items-center space-x-6">
          <div className="bg-[#f8fafc] px-6 py-3 rounded-2xl border border-[#002147]/5">
            <div className="text-sm font-semibold text-[#002147]/50 uppercase tracking-wider">Pending Scans</div>
            <div className="text-3xl font-black text-[#dc143c] mt-1">{queue.length}</div>
          </div>
        </div>
      </div>

      {/* TOP ROW: Full Width Main Canvas */}
      <div className="w-full min-h-[800px] bg-[#050505] rounded-3xl border border-[#002147]/10 shadow-2xl flex flex-col relative overflow-hidden group shrink-0">
        {/* Top Bar for Canvas */}
        <div className="absolute top-0 w-full z-20 bg-gradient-to-b from-black/80 to-transparent p-6 flex justify-between items-center pointer-events-none">
          <div className="flex items-center space-x-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
            <Scan className="w-5 h-5 text-[#dc143c]" />
            <div className="font-semibold text-white tracking-wide">Target: {activeSubmission ? activeSubmission.studentName : 'No Active Target'}</div>
          </div>
          
          <div className="flex space-x-4 pointer-events-auto">
            {activeSubmission && (
              <div className="bg-green-600/20 border border-green-500/50 text-green-400 font-bold px-6 py-2 rounded-full flex items-center space-x-2 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                <BrainCircuit className="w-5 h-5" />
                <span>AI Pre-Graded</span>
              </div>
            )}
          </div>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden p-8 lg:p-12 relative flex flex-col items-center"
          style={{ 
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        >
          {/* Glowing orbs in background */}
          <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-[#dc143c]/5 rounded-full blur-[100px] pointer-events-none"></div>

          {!activeSubmission && queue.length === 0 && (
            <div className="mt-32 text-center text-white/40">
              <Check className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-2xl font-bold">Queue is Empty</h3>
              <p className="mt-2">All submissions have been evaluated and approved.</p>
            </div>
          )}

          {/* Dynamic AI Rendered View (Instant) */}
          {scanResult && (
            <div className="w-full max-w-5xl mx-auto mt-16 mb-8 animate-in slide-in-from-bottom-8 duration-700">
              <div className="w-full">
                <AiEvaluationView scanResult={scanResult} />
              </div>
              
              {activeSubmission?.attachmentUrl && activeSubmission.attachmentUrl !== 'uploaded_via_api' && (
                <div className="mt-8 flex flex-col items-center">
                   <button 
                     onClick={() => setShowAttachment(!showAttachment)}
                     className="px-6 py-3 bg-[#002147] text-white font-bold rounded-lg shadow hover:bg-blue-900 transition flex items-center space-x-2"
                   >
                     <ZoomIn className="w-5 h-5" />
                     <span>{showAttachment ? 'Hide Student Rough Attachment' : 'View Student Rough Attachment'}</span>
                   </button>
                   
                   {showAttachment && (
                     <div className="w-full mt-6 bg-[#f4f4f0] shadow-xl rounded-md relative z-10 border border-[#002147]/10 p-6 flex flex-col animate-in fade-in slide-in-from-top-4">
                        <h4 className="font-bold text-[#002147] mb-4 text-lg border-b border-[#002147]/10 pb-2">Student's Attached Rough Work</h4>
                        <div className="flex-1 bg-white rounded-xl border border-[#002147]/10 overflow-hidden flex items-center justify-center p-2">
                          {activeSubmission.attachmentUrl.startsWith('data:application/pdf') ? (
                            <object data={activeSubmission.attachmentUrl} type="application/pdf" className="w-full h-full min-h-[800px] rounded">
                              <p>PDF cannot be displayed. <a href={activeSubmission.attachmentUrl} download="student_submission.pdf" className="text-blue-600 underline">Download instead</a></p>
                            </object>
                          ) : (
                            <img src={activeSubmission.attachmentUrl} alt="Rough Work" className="max-w-full h-auto max-h-[1200px] object-contain rounded" />
                          )}
                        </div>
                     </div>
                   )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* BOTTOM ROW: 3-Column Dashboard */}
      {scanResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4">
          
          {/* Col 1: Evaluation Summary Card */}
          <div className="bg-white p-8 rounded-3xl border border-[#002147]/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#dc143c]/10 to-transparent rounded-bl-full pointer-events-none"></div>
            <h3 className="font-extrabold text-[#002147] text-lg mb-8 tracking-wide">Evaluation Summary</h3>
            
            {/* Radial Score Gauge */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                  <circle 
                    cx="80" 
                    cy="80" 
                    r="70" 
                    stroke="currentColor" 
                    strokeWidth="12" 
                    fill="transparent" 
                    strokeDasharray="440" 
                    strokeDashoffset={440 - (440 * (scanResult.totalScore / scanResult.maxTotalScore))} 
                    className="text-[#dc143c] drop-shadow-[0_0_10px_rgba(220,20,60,0.4)] transition-all duration-1000 ease-out" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-[#002147] tracking-tighter">{scanResult.totalScore}<span className="text-2xl text-[#002147]/40 font-medium">/{scanResult.maxTotalScore}</span></span>
                </div>
              </div>

              <div className="mt-6 text-center text-[#dc143c] text-sm font-bold bg-[#dc143c]/5 py-2 px-4 rounded-xl border border-[#dc143c]/10 max-w-full">
                {scanResult.summary}
              </div>
            </div>
            
            <div className="space-y-4 mt-auto pt-8">
              <button onClick={handleApproveGrade} className="w-full bg-gradient-to-r from-[#002147] to-[#003366] text-white px-4 py-4 rounded-2xl font-bold text-lg hover:shadow-[0_10px_20px_rgba(0,33,71,0.2)] hover:-translate-y-0.5 transition-all flex items-center justify-center space-x-2">
                <Check className="w-6 h-6" />
                <span>Approve & Save Grade</span>
              </button>
            </div>
          </div>

          {/* Col 2: Queue List */}
          <div className="bg-white p-8 rounded-3xl border border-[#002147]/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="font-extrabold text-[#002147] text-lg tracking-wide">Student Queue</h3>
              <span className="text-xs font-bold bg-[#002147]/10 text-[#002147] px-3 py-1 rounded-full">{queue.length} Left</span>
            </div>
            
            <div className="space-y-3 overflow-y-auto pr-2 flex-1 max-h-[400px]">
              {queue.map((sub, i) => (
                <div 
                  key={`${sub.assignmentId}-${sub.id}`} 
                  onClick={() => { setActiveSubmission(sub); setShowAttachment(false); }}
                  className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all flex justify-between items-center group ${activeSubmission?.id === sub.id ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-[#002147]/10 hover:border-[#002147]/30'}`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-[#002147] group-hover:text-[#dc143c] transition-colors">{sub.studentName}</span>
                    <span className="text-xs text-[#002147]/60">{sub.assignmentTitle}</span>
                  </div>
                  <span className="text-xs font-bold text-[#002147]/40 bg-[#f8fafc] px-3 py-1.5 rounded-lg border border-[#002147]/5">Pending</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 3: Student Metrics */}
          <div className="bg-white p-8 rounded-3xl border border-[#002147]/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col">
            <h3 className="font-extrabold text-[#002147] text-lg tracking-wide mb-6">{activeSubmission?.studentName}'s Metrics</h3>
            
            <div className="flex-1 grid grid-cols-1 gap-4">
              <div className="bg-[#f8fafc] border border-[#002147]/5 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 text-[#002147]/5 group-hover:text-[#002147]/10 transition-colors">
                  <Clock className="w-16 h-16" />
                </div>
                <div className="text-sm font-bold text-[#002147]/60 mb-2">Avg. Time Taken</div>
                <div className="text-4xl font-black text-[#002147]">18<span className="text-xl font-medium text-[#002147]/60 ml-1">mins</span></div>
                <div className="mt-2 text-xs font-bold text-green-600 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" /> 10% faster
                </div>
              </div>

              <div className="bg-[#f8fafc] border border-[#002147]/5 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 text-[#002147]/5 group-hover:text-[#dc143c]/10 transition-colors">
                  <Activity className="w-16 h-16" />
                </div>
                <div className="text-sm font-bold text-[#002147]/60 mb-2">Historical Accuracy</div>
                <div className="text-4xl font-black text-[#002147]">76<span className="text-xl font-medium text-[#002147]/60">%</span></div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Show just queue if no scan result yet, to avoid empty screen */}
      {!scanResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-start-2 bg-white p-8 rounded-3xl border border-[#002147]/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="font-extrabold text-[#002147] text-lg tracking-wide">Student Queue</h3>
              <span className="text-xs font-bold bg-[#002147]/10 text-[#002147] px-3 py-1 rounded-full">{queue.length} Left</span>
            </div>
            <div className="space-y-3 overflow-y-auto pr-2 flex-1 max-h-[400px]">
              {queue.map((sub, i) => (
                <div 
                  key={`${sub.assignmentId}-${sub.id}`} 
                  onClick={() => { setActiveSubmission(sub); setScanResult(null); }}
                  className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all flex justify-between items-center group ${activeSubmission?.id === sub.id ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-[#002147]/10 hover:border-[#002147]/30'}`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-[#002147] group-hover:text-[#dc143c] transition-colors">{sub.studentName}</span>
                    <span className="text-xs text-[#002147]/60">{sub.assignmentTitle}</span>
                  </div>
                  <span className="text-xs font-bold text-[#002147]/40 bg-[#f8fafc] px-3 py-1.5 rounded-lg border border-[#002147]/5">Pending</span>
                </div>
              ))}
              {queue.length === 0 && <div className="text-center py-4 text-gray-500">No pending scans.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Add global CSS animation for the scanning line */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}} />
    </div>
  );
}
