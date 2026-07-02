'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, deleteDoc, doc, orderBy, updateDoc } from 'firebase/firestore';
import { Trash2, Users, FileText, CheckCircle, Clock, CheckSquare, Search, ChevronDown, ChevronUp, Loader2, Eye, X, Check, Edit3, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function AssignmentManagerPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [fetching, setFetching] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Grading Gallery state
  const [gradingEntry, setGradingEntry] = useState<{ assignmentId: string; studentId: string; submissionData: any; assignmentTitle: string } | null>(null);
  const [editGrade, setEditGrade] = useState<string>('');
  const [isEditingGrade, setIsEditingGrade] = useState(false);
  const [gradingSaving, setGradingSaving] = useState(false);

  const openGradingGallery = async (assignmentId: string, studentId: string, submissionData: any, assignmentTitle: string) => {
    // Fetch full submission if not already loaded
    setGradingEntry({ assignmentId, studentId, submissionData, assignmentTitle });
    setIsEditingGrade(false);
    setEditGrade(submissionData?.grade || '');
  };

  const saveGrade = async (approved: boolean, customGrade?: string) => {
    if (!gradingEntry || !profile?.schoolId) return;
    setGradingSaving(true);
    try {
      const subRef = doc(db, 'schools', profile.schoolId, 'assignments', gradingEntry.assignmentId, 'submissions', gradingEntry.studentId);
      const aiScore = gradingEntry.submissionData?.aiResult?.totalScore ?? gradingEntry.submissionData?.score ?? null;
      const aiMax = gradingEntry.submissionData?.aiResult?.maxTotalScore ?? gradingEntry.submissionData?.maxScore ?? null;
      const finalGrade = customGrade || gradingEntry.submissionData?.grade || (aiScore != null && aiMax != null ? `${aiScore}/${aiMax}` : 'N/A');
      await updateDoc(subRef, {
        teacherApproved: approved,
        finalGrade,
        gradedBy: profile.name || profile.uid,
        gradedAt: new Date().toISOString(),
      });
      // Refresh local state
      setAssignments(prev => prev.map(a => {
        if (a.id !== gradingEntry.assignmentId) return a;
        const newSubmittedData = { ...a.submittedData, [gradingEntry.studentId]: { ...a.submittedData?.[gradingEntry.studentId], teacherApproved: approved, finalGrade } };
        return { ...a, submittedData: newSubmittedData };
      }));
      setGradingEntry(null);
    } catch (e) {
      console.error('Failed to save grade', e);
    } finally {
      setGradingSaving(false);
    }
  };

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (profile?.schoolId) {
      fetchData();
    }
  }, [profile?.schoolId]);

  const fetchData = async () => {
    if (!profile?.schoolId) return;
    setFetching(true);
    try {
      // 1. Fetch all students in the school to know class totals and names
      const [usersSnap, globalSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', profile.schoolId),
          where('role', '==', 'student')
        )),
        getDocs(query(
          collection(db, 'global_users'),
          where('schoolId', '==', profile.schoolId),
          where('role', '==', 'student')
        )),
      ]);

      const seen = new Set<string>();
      const studentsMap: Record<string, any[]> = {};
      
      [...usersSnap.docs, ...globalSnap.docs].forEach(d => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          const s = { id: d.id, ...d.data() };
          // College students use branch, school students use studentClass
          const cls = s.studentClass || s.branch || 'Unassigned';
          if (!studentsMap[cls]) studentsMap[cls] = [];
          studentsMap[cls].push(s);
        }
      });
      setStudentsByClass(studentsMap);

      // 2. Fetch all assignments
      const assignmentsSnap = await getDocs(
        collection(db, 'schools', profile.schoolId, 'assignments')
      );
      
      const tasks: any[] = [];
      assignmentsSnap.forEach(d => tasks.push({ id: d.id, ...d.data() }));

      // 3. Fetch submissions for each assignment
      const tasksWithStats = await Promise.all(tasks.map(async (task) => {
         const subsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments', task.id, 'submissions'));
         const submittedStudentIds = new Set<string>();
         const submittedData: Record<string, any> = {};
         subsSnap.forEach(s => {
           submittedStudentIds.add(s.id);
           submittedData[s.id] = s.data();
         });
         
         // Use branch as class key for college assignments
         const classKey = task.class || '';
         const classStds = studentsMap[classKey] || [];
         
         return {
           ...task,
           submittedStudentIds,
           submittedData,
           totalStudents: classStds.length
         };
      }));

      // Sort by creation date (newest first)
      tasksWithStats.sort((a, b) => {
        const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
        const dbT = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
        return dbT - da;
      });

      setAssignments(tasksWithStats);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile?.schoolId) return;
    if (!window.confirm("Are you sure you want to permanently delete this assignment?")) return;
    
    try {
      await deleteDoc(doc(db, 'schools', profile.schoolId, 'assignments', taskId));
      setAssignments(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error("Failed to delete assignment:", err);
      alert("Failed to delete assignment. Please try again.");
    }
  };

  const filteredAssignments = assignments.filter(a => 
    (a.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (a.class?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (a.subject?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#002147]/20 border-t-[#002147] rounded-full animate-spin" />
          <p className="text-[#002147]/60 font-bold tracking-widest uppercase text-sm">Loading Assignments…</p>
        </div>
      </div>
    );
  }

  const mainContent = (
    <div className="max-w-6xl mx-auto pb-20 animate-in fade-in duration-500">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#002147]">Assignment Manager</h1>
            <p className="text-gray-500 mt-2 font-medium">Manage your posted assignments, view completion rates, and delete tasks.</p>
          </div>
          <div className="relative max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search assignments..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-[#002147]/20 transition-all"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-500">No assignments found</h3>
              <p className="text-gray-400 mt-2">You haven't posted any assignments yet or none match your search.</p>
            </div>
          ) : (
            filteredAssignments.map((assignment) => {
              const classStds = studentsByClass[assignment.class] || [];
              const submittedCount = assignment.submittedStudentIds.size;
              const totalCount = assignment.totalStudents;
              const isExpanded = expandedId === assignment.id;
              
              // Students from roster who submitted
              const submittedStudents = classStds.filter((s: any) => assignment.submittedStudentIds.has(s.id));
              const missingStudents = classStds.filter((s: any) => !assignment.submittedStudentIds.has(s.id));

              // Submitters not found in local roster (college or late-added students)
              const rosterIds = new Set(classStds.map((s: any) => s.id));
              const extraSubmitters = [...assignment.submittedStudentIds].filter((id: string) => !rosterIds.has(id)).map((id: string) => ({
                id,
                name: assignment.submittedData?.[id]?.studentName || 'Student',
                branch: assignment.submittedData?.[id]?.branch || '',
                year: assignment.submittedData?.[id]?.year || '',
              }));
              const allSubmitters = [...submittedStudents, ...extraSubmitters];

              return (
                <div key={assignment.id} className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-[#002147]/30 shadow-md ring-1 ring-[#002147]/10' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                  {/* Assignment Header (Clickable) */}
                  <div 
                    onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">{assignment.class}</span>
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">{assignment.subject}</span>
                        {assignment.type && <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">{assignment.type}</span>}
                      </div>
                      <h3 className="text-xl font-bold text-[#002147] truncate pr-4">{assignment.title || 'Untitled Assignment'}</h3>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 font-medium">
                        <span className="flex items-center space-x-1.5"><Clock className="w-4 h-4"/> <span>Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'}</span></span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
                      {/* Stats */}
                      <div className="text-center bg-gray-50 px-4 py-2 rounded-xl">
                        <div className="text-lg font-black text-[#002147]">
                          <span className={submittedCount === totalCount && totalCount > 0 ? "text-emerald-600" : "text-[#002147]"}>{submittedCount}</span>
                          <span className="text-gray-300 mx-1">/</span>
                          <span>{totalCount}</span>
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => handleDelete(assignment.id, e)}
                          className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Delete Assignment"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="p-2 text-gray-400">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content: Student Lists */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        
                        {/* Completed List */}
                        <div>
                          <h4 className="font-bold text-emerald-700 flex items-center mb-4 text-sm uppercase tracking-wider border-b border-emerald-100 pb-2">
                            <CheckCircle className="w-4 h-4 mr-2" /> 
                            Completed ({allSubmitters.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {allSubmitters.length === 0 ? (
                              <p className="text-sm text-gray-400 italic">No students have completed this yet.</p>
                            ) : (
                              allSubmitters.map((s: any) => {
                                const subData = assignment.submittedData?.[s.id];
                                const aiGrade = subData?.grade || (subData?.score != null && subData?.maxScore ? `${subData.score}/${subData.maxScore}` : null);
                                const isApproved = subData?.teacherApproved;
                                return (
                                  <div key={s.id} className="bg-white border border-emerald-100 p-3 rounded-xl shadow-sm flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center text-xs shrink-0">{(s.name || 'S').charAt(0)}</div>
                                    <div className="flex-1 min-w-0">
                                      <span className="font-semibold text-gray-800 text-sm truncate block">{s.name}</span>
                                      {(s.branch || s.year) && <span className="text-xs text-gray-400">{s.branch} {s.year}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {aiGrade && (
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                          {isApproved ? '✓' : '🤖'} {subData?.finalGrade || aiGrade}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => openGradingGallery(assignment.id, s.id, subData, assignment.title)}
                                        className="flex items-center gap-1 text-xs font-bold text-[#002147] bg-gray-100 hover:bg-[#002147] hover:text-white px-2.5 py-1.5 rounded-lg transition-colors"
                                      >
                                        <Eye className="w-3 h-3" /> View
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Missing List */}
                        <div>
                          <h4 className="font-bold text-red-600 flex items-center mb-4 text-sm uppercase tracking-wider border-b border-red-100 pb-2">
                            <Users className="w-4 h-4 mr-2" /> 
                            Pending ({missingStudents.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                            {missingStudents.length === 0 ? (
                              <p className="text-sm text-gray-400 italic">All students have completed this!</p>
                            ) : (
                              missingStudents.map(s => (
                                <div key={s.id} className="bg-white border border-red-100 p-3 rounded-xl shadow-sm flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-red-50 text-red-500 font-bold flex items-center justify-center text-xs shrink-0">{s.name.charAt(0)}</div>
                                  <span className="font-semibold text-gray-800 text-sm truncate">{s.name}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  // Grading Gallery Panel (rendered outside main div, as full-screen overlay)
  const gradingPanel = gradingEntry && (
    <div className="fixed inset-0 z-[300] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setGradingEntry(null)} />
      {/* Panel */}
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#002147] to-[#003366] px-6 py-5 flex items-start justify-between shrink-0">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Grading Gallery</p>
            <h2 className="text-white font-bold text-lg leading-tight">{gradingEntry.assignmentTitle}</h2>
            <p className="text-blue-300 text-sm mt-1">{gradingEntry.submissionData?.studentName}</p>
          </div>
          <button onClick={() => setGradingEntry(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 ml-4 shrink-0">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Student Answer */}
          {gradingEntry.submissionData?.text && (
            <div>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Student's Written Answer</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {gradingEntry.submissionData.text}
              </div>
            </div>
          )}

          {/* Student Images */}
          {gradingEntry.submissionData?.imageUrls?.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Submitted Pages ({gradingEntry.submissionData.imageUrls.length})</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {gradingEntry.submissionData.imageUrls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Page ${i+1}`} className="h-40 w-auto rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* AI Grading Result */}
          {gradingEntry.submissionData?.aiResult ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-blue-600 uppercase tracking-wider">🤖 AI Examiner Breakdown</h3>
                <div className="text-2xl font-black text-[#002147]">
                  {gradingEntry.submissionData.aiResult.totalScore ?? '?'}
                  <span className="text-gray-400 text-lg font-bold">/{gradingEntry.submissionData.aiResult.maxTotalScore ?? '?'}</span>
                </div>
              </div>

              {gradingEntry.submissionData.aiResult.summary && (
                <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">{gradingEntry.submissionData.aiResult.summary}</p>
              )}

              <div className="space-y-4">
                {(gradingEntry.submissionData.aiResult.questions || []).map((q: any, i: number) => (
                  <div key={i} className={`rounded-xl border p-4 ${q.isFinalAnswerCorrect ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-bold text-[#002147] text-sm flex-1">{q.questionText}</p>
                      <span className={`text-sm font-black shrink-0 px-2 py-0.5 rounded-lg ${q.awardedScore === q.maxScore ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {q.awardedScore}/{q.maxScore}
                      </span>
                    </div>
                    {q.lostMarksReason && (
                      <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg p-2 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{q.lostMarksReason}</span>
                      </div>
                    )}
                    {q.aiCorrectedSolution?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-gray-500 mb-1">Correct Approach:</p>
                        <ul className="text-xs text-gray-600 space-y-0.5">
                          {q.aiCorrectedSolution.map((step: string, si: number) => (
                            <li key={si} className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">✓</span> {step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-700 font-medium">⚠️ No AI grading data available for this submission.</p>
              <p className="text-xs text-amber-600 mt-1">This may be an older submission. You can still manually set the grade below.</p>
            </div>
          )}

          {/* Teacher Grade Controls */}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4">Your Decision</h3>

            {gradingEntry.submissionData?.teacherApproved != null && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-sm font-bold text-emerald-700">✓ Already graded: {gradingEntry.submissionData.finalGrade}</p>
              </div>
            )}

            {isEditingGrade ? (
              <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700">Enter final grade (e.g. &quot;8/10&quot; or &quot;B+&quot;):</label>
                <input
                  type="text"
                  value={editGrade}
                  onChange={e => setEditGrade(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                  placeholder="e.g. 7/10"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => saveGrade(true, editGrade)}
                    disabled={gradingSaving || !editGrade.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#002147] text-white py-2.5 rounded-xl font-bold text-sm hover:bg-[#003366] transition-colors disabled:opacity-50"
                  >
                    {gradingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Grade
                  </button>
                  <button onClick={() => setIsEditingGrade(false)} className="px-4 py-2.5 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => saveGrade(true)}
                  disabled={gradingSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                >
                  {gradingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Accept AI Grade
                </button>
                <button
                  onClick={() => { setIsEditingGrade(true); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit Grade
                </button>
                <button
                  onClick={() => saveGrade(false, '0')}
                  disabled={gradingSaving}
                  className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      {gradingPanel}
    </>
  );
}
