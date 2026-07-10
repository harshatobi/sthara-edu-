'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, X, Loader2, BookOpen, Users, User, ArrowLeft, ChevronRight, Save } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { doc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function ClassesTab({ schoolId, institutionType, allUsers }: { schoolId: string, institutionType: 'school' | 'college', allUsers: any[] }) {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Views: 'list' | 'wizard' | 'detail'
  const [view, setView] = useState<'list' | 'wizard' | 'detail'>('list');
  const [selectedClass, setSelectedClass] = useState<any | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [wizardData, setWizardData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClasses();
  }, [schoolId]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const qs = await getDocs(collection(db, 'schools', schoolId, 'classes'));
      setClasses(qs.docs.map(d => d.data()));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      // ── Step 1: Compress image using canvas (max 1024px, JPEG 0.75) ──
      const compressedBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const MAX = 1024;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round((h / w) * MAX); w = MAX; }
              else { w = Math.round((w / h) * MAX); h = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            // Always output as JPEG for consistent smaller size
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            resolve(dataUrl.split(',')[1]);
          };
          img.onerror = reject;
          img.src = ev.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadingImage(false);
      setAnalyzing(true);

      // ── Step 2: Get Firebase auth token ──
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) {
        alert('Authentication error: Please sign in again.');
        setAnalyzing(false);
        return;
      }

      // ── Step 3: Call the API ──
      const res = await fetch('/api/superadmin/analyze-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ imageBase64: compressedBase64, mimeType: 'image/jpeg' })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): ${text.substring(0, 200)}`);
      }

      const data = await res.json();
      if (data.success) {
        setWizardData(data.data);
        setWizardStep(2);
      } else {
        alert('Failed to analyze: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setAnalyzing(false);
  };


  const saveClass = async () => {
    setUploadingImage(true);
    try {
      const className = wizardData.branch ? `${wizardData.branch} ${wizardData.year || ''} ${wizardData.semester || ''}`.trim() : 'New Class';
      const dataToSave = { ...wizardData, name: className };

      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/superadmin/create-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ schoolId, classData: dataToSave })
      });
      const data = await res.json();

      if (data.success) {
        await fetchClasses();
        setView('list');
        setWizardStep(1);
        setWizardData(null);
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert(e.message);
    }
    setUploadingImage(false);
  };


  // Assign Teacher logic
  const [assigningSubject, setAssigningSubject] = useState<string | null>(null);
  
  const handleAssignTeacher = async (teacherId: string, teacherName: string) => {
    if (!selectedClass || !assigningSubject) return;

    const updatedSubjects = selectedClass.subjects.map((sub: any) => 
      sub.id === assigningSubject ? { ...sub, assignedTeacherId: teacherId, assignedTeacherName: teacherName } : sub
    );

    // 1. Update Class Document
    await updateDoc(doc(db, 'schools', schoolId, 'classes', selectedClass.id), {
      subjects: updatedSubjects
    });

    // 2. Update Teacher Document
    const subject = updatedSubjects.find((s: any) => s.id === assigningSubject);
    const teacherDocRef = doc(db, 'schools', schoolId, 'users', teacherId);
    const globalTeacherDocRef = doc(db, 'global_users', teacherId);

    const teacherData = allUsers.find(u => u.id === teacherId);
    if (teacherData) {
      const newTeachingSubjects = [...(teacherData.teachingSubjects || [])];
      // Check if already assigned
      if (!newTeachingSubjects.find(ts => ts.subjectId === assigningSubject)) {
        newTeachingSubjects.push({
          classId: selectedClass.id,
          className: selectedClass.name,
          subjectId: subject.id,
          subjectName: subject.name,
          curriculum: selectedClass.curriculum,
          units: subject.units
        });
        await updateDoc(teacherDocRef, { teachingSubjects: newTeachingSubjects });
        await updateDoc(globalTeacherDocRef, { teachingSubjects: newTeachingSubjects });
      }
    }

    setSelectedClass({ ...selectedClass, subjects: updatedSubjects });
    setAssigningSubject(null);
  };

  if (view === 'wizard') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 p-6 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-8 border-b border-[#002147]/10 pb-4">
          <div className="flex items-center space-x-3">
            <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
            <h2 className="text-xl font-bold text-[#002147]">Setup New Class via Course Upload</h2>
          </div>
          <div className="flex items-center space-x-2 text-sm font-semibold">
            <span className={wizardStep === 1 ? 'text-[#002147]' : 'text-gray-400'}>1. Upload</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className={wizardStep === 2 ? 'text-[#002147]' : 'text-gray-400'}>2. Review & Confirm</span>
          </div>
        </div>

        {wizardStep === 1 ? (
          <div className="max-w-2xl mx-auto py-12">
            <div className="border-2 border-dashed border-[#002147]/20 rounded-3xl p-12 text-center hover:bg-[#002147]/5 transition-colors cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
              
              {uploadingImage || analyzing ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#002147] animate-spin" />
                  <p className="text-lg font-semibold text-[#002147]">{analyzing ? 'AI is analyzing curriculum...' : 'Uploading image...'}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
                    <Upload className="w-10 h-10 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[#002147]">Click to upload course list image</p>
                    <p className="text-sm text-gray-500 mt-2">AI will automatically extract subjects, topics, and curriculum info</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Curriculum</label>
                <input type="text" value={wizardData.curriculum || ''} onChange={e => setWizardData({...wizardData, curriculum: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Branch</label>
                <input type="text" value={wizardData.branch || ''} onChange={e => setWizardData({...wizardData, branch: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Year</label>
                <input type="text" value={wizardData.year || ''} onChange={e => setWizardData({...wizardData, year: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Semester</label>
                <input type="text" value={wizardData.semester || ''} onChange={e => setWizardData({...wizardData, semester: e.target.value})} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-medium" />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#002147] mb-4">Extracted Subjects ({wizardData.subjects?.length || 0})</h3>
              <div className="space-y-4">
                {(wizardData.subjects || []).map((sub: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 flex flex-col space-y-3 bg-white">
                    <div className="flex gap-4">
                      <input type="text" value={sub.name} onChange={e => {
                        const newSubs = [...wizardData.subjects];
                        newSubs[idx].name = e.target.value;
                        setWizardData({...wizardData, subjects: newSubs});
                      }} className="flex-1 font-bold text-[#002147] text-lg border-b border-dashed border-gray-300 px-1 py-1 focus:border-[#002147] focus:outline-none" placeholder="Subject Name" />
                      <input type="text" value={sub.code} onChange={e => {
                        const newSubs = [...wizardData.subjects];
                        newSubs[idx].code = e.target.value;
                        setWizardData({...wizardData, subjects: newSubs});
                      }} className="w-32 font-mono text-gray-500 border-b border-dashed border-gray-300 px-1 py-1 focus:outline-none text-center" placeholder="Code" />
                    </div>
                    <div className="pl-2">
                      <p className="text-sm font-semibold text-gray-600 mb-2">{sub.units?.length || 0} Units Extracted</p>
                      <div className="flex gap-2 flex-wrap">
                        {(sub.units || []).map((u: any, i: number) => (
                          <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md border border-blue-100 font-medium">
                            U{u.unitNo}: {u.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-100">
              <button onClick={saveClass} disabled={uploadingImage} className="bg-[#002147] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-900 transition-colors disabled:opacity-50">
                {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Confirm & Create Class Environment
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'detail' && selectedClass) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center space-x-3 mb-6">
          <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-full bg-white shadow-sm border border-gray-100"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
          <div>
            <h2 className="text-2xl font-bold text-[#002147]">{selectedClass.name}</h2>
            <div className="flex gap-2 mt-1">
              <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{selectedClass.curriculum}</span>
              <span className="text-xs text-gray-500">{selectedClass.branch} • {selectedClass.year}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 p-6">
              <h3 className="text-lg font-bold text-[#002147] mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5" /> Subjects ({selectedClass.subjects?.length || 0})</h3>
              
              <div className="space-y-4">
                {(selectedClass.subjects || []).map((sub: any) => (
                  <div key={sub.id} className="border border-gray-100 rounded-xl p-5 hover:border-blue-100 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-lg text-[#002147]">{sub.name}</h4>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">{sub.code}</p>
                      </div>
                      
                      {/* Teacher Assignment block */}
                      {assigningSubject === sub.id ? (
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 min-w-[250px]">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Assign Teacher</span>
                            <button onClick={() => setAssigningSubject(null)}><X className="w-4 h-4 text-gray-400" /></button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {allUsers.filter(u => u.role === 'teacher').map(t => (
                              <button key={t.id} onClick={() => handleAssignTeacher(t.id, t.name)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg text-[#002147] font-medium transition-colors">
                                {t.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {sub.assignedTeacherId ? (
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100" onClick={() => setAssigningSubject(sub.id)}>
                              <User className="w-4 h-4 text-blue-700" />
                              <span className="text-sm font-semibold text-blue-800">{sub.assignedTeacherName}</span>
                            </div>
                          ) : (
                            <button onClick={() => setAssigningSubject(sub.id)} className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-1.5 rounded-lg transition-colors border border-blue-100 border-dashed">
                              + Assign Teacher
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                      <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-md">{sub.units?.length || 0} Units</span>
                      <span className="text-xs text-gray-400 truncate flex-1">
                        {(sub.units || []).map((u: any) => u.name).join(' • ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 p-6">
              <h3 className="text-lg font-bold text-[#002147] mb-4 flex items-center gap-2"><Users className="w-5 h-5" /> Enrolled Students</h3>
              <p className="text-3xl font-black text-[#002147]">{selectedClass.enrolledStudentIds?.length || 0}</p>
              <p className="text-sm text-gray-500 mt-1">Students will be auto-enrolled when added to this class via the Users tab.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
        <div>
          <h2 className="text-xl font-bold text-[#002147]">Managed Classes & Curriculums</h2>
          <p className="text-sm text-gray-500 mt-1">Upload course lists to automatically generate subjects, units, and AI contexts.</p>
        </div>
        <button onClick={() => setView('wizard')} className="bg-[#002147] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-[#002147]/90 transition-all shadow-md">
          <Plus className="w-5 h-5" /> Setup New Class
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#002147]" /></div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-[#002147]/20 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-[#002147] mb-2">No classes setup yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">Use the Course Upload Wizard to instantly setup a class from a syllabus image.</p>
          <button onClick={() => setView('wizard')} className="text-blue-600 font-bold hover:underline">Get Started →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map(cls => (
            <div key={cls.id} onClick={() => { setSelectedClass(cls); setView('detail'); }} className="bg-white rounded-2xl p-6 shadow-sm border border-[#002147]/10 hover:border-[#002147]/30 hover:shadow-md cursor-pointer transition-all group">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-[#002147] group-hover:text-blue-700 transition-colors">{cls.name}</h3>
                <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">{cls.curriculum}</span>
              </div>
              
              <div className="space-y-2 mb-6">
                <p className="text-sm text-gray-600 flex justify-between"><span className="text-gray-400">Branch:</span> <span className="font-medium text-[#002147] truncate ml-2">{cls.branch}</span></p>
                <p className="text-sm text-gray-600 flex justify-between"><span className="text-gray-400">Subjects:</span> <span className="font-bold text-[#002147]">{cls.subjects?.length || 0}</span></p>
                <p className="text-sm text-gray-600 flex justify-between"><span className="text-gray-400">Students:</span> <span className="font-bold text-[#002147]">{cls.enrolledStudentIds?.length || 0}</span></p>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center text-sm font-bold text-blue-600 justify-between">
                Manage Class <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
