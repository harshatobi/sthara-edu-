'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { 
  Award, BookOpen, Download, Search, AlertCircle, ChevronDown, 
  Sparkles, TrendingUp, Medal, Users, GraduationCap, CheckCircle, FileText
} from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  subject: string;
  targetClass: string;
}

interface StudentSubmission {
  id: string;
  studentName: string;
  className: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
}

interface OverallRank {
  id: string;
  studentName: string;
  className: string;
  totalMarksObtained: number;
  totalMaxMarks: number;
  averagePercentage: number;
  assignmentsAppeared: number;
}

export default function AcademicResults() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<StudentSubmission[]>([]);
  const [overallLeaderboard, setOverallLeaderboard] = useState<OverallRank[]>([]);
  
  const [activeTab, setActiveTab] = useState<'assignments' | 'leaderboard'>('assignments');
  const [isLoading, setIsLoading] = useState(true);

  // New Features State
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('All Classes');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Top Level Metrics State
  const [totalGradedSubs, setTotalGradedSubs] = useState(0);
  const [schoolAverage, setSchoolAverage] = useState(0);
  const [topPerformingClass, setTopPerformingClass] = useState<{name: string, avg: number} | null>(null);

  useEffect(() => {
    if (!profile?.schoolId) return;
    const schoolId = profile.schoolId;

    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const assignSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments'));
        const assignsList: Assignment[] = [];
        
        const studentAggregates: Record<string, {
          name: string;
          className: string;
          obtained: number;
          max: number;
          count: number;
        }> = {};

        assignSnap.docs.forEach((taskDoc) => {
          const taskData = taskDoc.data();
          assignsList.push({
            id: taskDoc.id,
            title: taskData.title,
            subject: taskData.subject,
            targetClass: taskData.class || taskData.targetClass || 'N/A'
          });
        });
        
        // Fetch students from both collections, filtered by schoolId
        const [usersSnap, globalSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('schoolId', '==', schoolId))),
          getDocs(query(collection(db, 'global_users'), where('role', '==', 'student'), where('schoolId', '==', schoolId))),
        ]);
        const studentMap: Record<string, {name: string, class: string}> = {};
        [...usersSnap.docs, ...globalSnap.docs].forEach(uDoc => {
          if (!studentMap[uDoc.id]) {
            const d = uDoc.data();
            studentMap[uDoc.id] = { name: d.name, class: d.studentClass || 'N/A' };
          }
        });

        let totalGradedCount = 0;
        let grandTotalObtained = 0;
        let grandTotalMax = 0;
        const classAggregates: Record<string, { obtained: number, max: number }> = {};

        for (const task of assignsList) {
          const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', task.id, 'submissions'));
          subsSnap.forEach(subDoc => {
             const sub = subDoc.data();
             if (sub.teacherApproved && sub.maxScore > 0) {
                totalGradedCount++;
                grandTotalObtained += Number(sub.score || 0);
                grandTotalMax += Number(sub.maxScore);

                const sId = subDoc.id;
                const studentInfo = studentMap[sId] || { name: 'Unknown Student', class: 'N/A' };
                
                if (!studentAggregates[sId]) {
                  studentAggregates[sId] = {
                    name: studentInfo.name,
                    className: studentInfo.class,
                    obtained: 0,
                    max: 0,
                    count: 0
                  };
                }
                studentAggregates[sId].obtained += Number(sub.score || 0);
                studentAggregates[sId].max += Number(sub.maxScore);
                studentAggregates[sId].count += 1;

                if (!classAggregates[studentInfo.class]) {
                  classAggregates[studentInfo.class] = { obtained: 0, max: 0 };
                }
                classAggregates[studentInfo.class].obtained += Number(sub.score || 0);
                classAggregates[studentInfo.class].max += Number(sub.maxScore);
             }
          });
        }

        const ranks: OverallRank[] = Object.keys(studentAggregates).map(sId => {
           const agg = studentAggregates[sId];
           return {
             id: sId,
             studentName: agg.name,
             className: agg.className,
             totalMarksObtained: agg.obtained,
             totalMaxMarks: agg.max,
             averagePercentage: agg.max > 0 ? (agg.obtained / agg.max) * 100 : 0,
             assignmentsAppeared: agg.count
           };
        });
        
        ranks.sort((a, b) => b.averagePercentage - a.averagePercentage);
        
        // Calculate Metrics
        setTotalGradedSubs(totalGradedCount);
        setSchoolAverage(grandTotalMax > 0 ? (grandTotalObtained / grandTotalMax) * 100 : 0);
        
        let bestClass = null;
        let bestAvg = -1;
        Object.keys(classAggregates).forEach(cName => {
          const cData = classAggregates[cName];
          const avg = cData.max > 0 ? (cData.obtained / cData.max) * 100 : 0;
          if (avg > bestAvg) {
            bestAvg = avg;
            bestClass = cName;
          }
        });
        if (bestClass) setTopPerformingClass({ name: bestClass, avg: bestAvg });

        setOverallLeaderboard(ranks);
        setAssignments(assignsList);
        if (assignsList.length > 0) {
          setSelectedAssignment(assignsList[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!profile?.schoolId || !selectedAssignment) return;
    const schoolId = profile.schoolId;

    const loadSingleAssignment = async () => {
       const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', selectedAssignment, 'submissions'));
       
       // Fetch students from both collections, filtered by schoolId
       const [usersSnap, globalSnap] = await Promise.all([
         getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('schoolId', '==', schoolId))),
         getDocs(query(collection(db, 'global_users'), where('role', '==', 'student'), where('schoolId', '==', schoolId))),
       ]);
       const studentMap: Record<string, {name: string, class: string}> = {};
       [...usersSnap.docs, ...globalSnap.docs].forEach(uDoc => {
         if (!studentMap[uDoc.id]) {
           const d = uDoc.data();
           studentMap[uDoc.id] = { name: d.name, class: d.studentClass || 'N/A' };
         }
       });

       const subs: StudentSubmission[] = [];
       subsSnap.forEach(subDoc => {
         const sub = subDoc.data();
         if (sub.teacherApproved && sub.maxScore > 0) {
            const sId = subDoc.id;
            const studentInfo = studentMap[sId] || { name: 'Unknown Student', class: 'N/A' };
            const percentage = (sub.score / sub.maxScore) * 100;
            subs.push({
              id: sId,
              studentName: studentInfo.name,
              className: studentInfo.class,
              marksObtained: Number(sub.score),
              maxMarks: Number(sub.maxScore),
              percentage: percentage
            });
         }
       });

       subs.sort((a, b) => b.percentage - a.percentage);
       setAssignmentSubmissions(subs);
    };

    loadSingleAssignment();
  }, [selectedAssignment, profile?.schoolId]);

  // Derived state for filters
  const uniqueClasses = useMemo(() => {
    const classes = new Set(overallLeaderboard.map(r => r.className));
    return ['All Classes', ...Array.from(classes).sort()];
  }, [overallLeaderboard]);

  const filteredLeaderboard = useMemo(() => {
    return overallLeaderboard.filter(rank => {
      const matchClass = selectedClassFilter === 'All Classes' || rank.className === selectedClassFilter;
      const matchSearch = rank.studentName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchClass && matchSearch;
    });
  }, [overallLeaderboard, selectedClassFilter, searchQuery]);

  const filteredAssignmentSubs = useMemo(() => {
    return assignmentSubmissions.filter(sub => {
      const matchClass = selectedClassFilter === 'All Classes' || sub.className === selectedClassFilter;
      const matchSearch = sub.studentName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchClass && matchSearch;
    });
  }, [assignmentSubmissions, selectedClassFilter, searchQuery]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-[#002147] font-semibold tracking-wide">Compiling Academic Records...</p>
        </div>
      </div>
    );
  }

  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (activeTab === 'assignments') {
      const a = assignments.find(x => x.id === selectedAssignment);
      csvContent += `Assignment: ${a?.title} (${a?.targetClass})\n`;
      csvContent += "Rank,Student Name,Class,Marks Obtained,Max Marks,Percentage\n";
      filteredAssignmentSubs.forEach((sub, i) => {
        csvContent += `${i + 1},${sub.studentName},${sub.className},${sub.marksObtained},${sub.maxMarks},${sub.percentage.toFixed(1)}%\n`;
      });
    } else {
      csvContent += `Leaderboard Filter: ${selectedClassFilter}\n`;
      csvContent += "Rank,Student Name,Class,Total Marks Obtained,Total Max Marks,Overall Percentage,Assignments Appeared\n";
      filteredLeaderboard.forEach((rank, i) => {
        csvContent += `${i + 1},${rank.studentName},${rank.className},${rank.totalMarksObtained},${rank.totalMaxMarks},${rank.averagePercentage.toFixed(1)}%,${rank.assignmentsAppeared}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", activeTab === 'assignments' ? "assignment_results.csv" : "school_leaderboard.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-500';
    if (percentage >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getProgressBg = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-100';
    if (percentage >= 60) return 'bg-amber-100';
    return 'bg-rose-100';
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* Premium Header Banner */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl shadow-inner border border-indigo-400">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Performance Insights</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#002147]">Academic Results</h1>
            </div>
          </div>

          <button 
            onClick={exportCSV}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white border border-gray-200 text-[#002147] rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 space-y-8 animate-in fade-in duration-500">
        
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all duration-500">
              <CheckCircle className="w-40 h-40 text-blue-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-4xl font-black text-[#002147] mb-1">{totalGradedSubs}</h3>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Graded Subs</p>
              <div className="inline-flex items-center space-x-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                <BookOpen className="w-3 h-3" />
                <span>Across All Assignments</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#002147] to-indigo-900 rounded-2xl shadow-lg border border-indigo-800 p-6 relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
              <TrendingUp className="w-40 h-40 text-white" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 backdrop-blur-sm">
                <TrendingUp className="w-6 h-6 text-indigo-200" />
              </div>
              <h3 className="text-4xl font-black text-white mb-1">{schoolAverage.toFixed(1)}%</h3>
              <p className="text-sm font-bold text-indigo-200 uppercase tracking-wider mb-2">School Average Score</p>
              <div className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-100 bg-indigo-950/50 px-2 py-1 rounded-md border border-indigo-800">
                <Users className="w-3 h-3" />
                <span>Cumulative Performance</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all duration-500">
              <Award className="w-40 h-40 text-amber-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
                <Award className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-4xl font-black text-[#002147] mb-1">{topPerformingClass?.name || 'N/A'}</h3>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Top Performing Class</p>
              <div className="inline-flex items-center space-x-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                <TrendingUp className="w-3 h-3" />
                <span>Avg: {topPerformingClass ? topPerformingClass.avg.toFixed(1) + '%' : '0%'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'assignments' ? 'bg-white text-[#002147] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Assignment Results
            </button>
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'leaderboard' ? 'bg-white text-[#002147] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Overall Leaderboard
            </button>
          </div>

          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-4">
            <div className="relative">
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="w-full sm:w-48 appearance-none bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-[#002147] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer text-sm"
              >
                {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Empty State — no assignments at all */}
        {assignments.length === 0 && !isLoading && (
          <div className="py-24 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-[#002147] mb-2">No Assignments Yet</h3>
            <p className="text-gray-500 max-w-sm mb-6">Generate quizzes and assignments using the AI Paper Generator, then results will appear here.</p>
            <a href="/admin/paper-gen" className="px-6 py-3 bg-[#002147] text-white font-bold rounded-xl hover:bg-[#003366] transition-colors">Go to Paper Generator</a>
          </div>
        )}

        {/* Content Area */}
        {assignments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
          {activeTab === 'assignments' ? (
            <div>
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#002147]">Assignment Results</h2>
                  <p className="text-sm font-medium text-gray-500 mt-0.5">Select an assignment to view its rankings</p>
                </div>
                <div className="w-full md:w-1/3 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-4 w-4 text-[#002147]/40" />
                  </div>
                  <select
                    className="block w-full pl-10 pr-10 py-2.5 border-gray-200 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:text-sm rounded-xl border appearance-none bg-white text-[#002147] font-semibold transition-all cursor-pointer"
                    value={selectedAssignment || ''}
                    onChange={(e) => setSelectedAssignment(e.target.value)}
                  >
                    {assignments.length === 0 && <option value="">No Assignments Available</option>}
                    {assignments.map(a => (
                      <option key={a.id} value={a.id}>{a.title} ({a.targetClass})</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              {selectedAssignment && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white border-b border-gray-100">
                      <tr>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs w-16 text-center">Rank</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs">Student</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs">Class</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs text-right">Score</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs w-48">Performance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAssignmentSubs.length > 0 ? (
                        filteredAssignmentSubs.map((sub, idx) => (
                          <tr key={sub.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="p-4 text-center font-bold text-gray-500 group-hover:text-[#002147] transition-colors">{idx + 1}</td>
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-blue-200 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-inner">
                                  {sub.studentName.charAt(0)}
                                </div>
                                <span className="font-bold text-[#002147]">{sub.studentName}</span>
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-500">{sub.className}</td>
                            <td className="p-4 text-right">
                              <span className="font-bold text-[#002147]">{sub.marksObtained}</span>
                              <span className="text-gray-400 text-xs ml-1">/ {sub.maxMarks}</span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${getProgressBg(sub.percentage)}`}>
                                  <div 
                                    className={`h-full rounded-full ${getProgressColor(sub.percentage)} transition-all duration-1000 ease-out`} 
                                    style={{ width: `${sub.percentage}%` }}
                                  />
                                </div>
                                <span className={`font-bold text-xs w-10 text-right ${
                                  sub.percentage >= 80 ? 'text-emerald-600' :
                                  sub.percentage >= 60 ? 'text-amber-600' : 'text-rose-600'
                                }`}>
                                  {Math.round(sub.percentage)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-12 text-center">
                            <div className="flex flex-col items-center justify-center space-y-3">
                              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-gray-400" />
                              </div>
                              <p className="text-gray-500 font-medium">No results found.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-start space-x-3">
                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl shrink-0">
                   <Award className="w-5 h-5" />
                 </div>
                 <div>
                   <h2 className="text-lg font-bold text-[#002147]">Overall School Leaderboard</h2>
                   <p className="text-sm font-medium text-gray-500 mt-0.5">Cumulative ranking across all graded assignments.</p>
                 </div>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white border-b border-gray-100">
                      <tr>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs w-16 text-center">Rank</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs">Student</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs">Class</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs text-center">Exams</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs text-right">Total Score</th>
                        <th className="p-4 font-bold text-gray-400 uppercase tracking-wider text-xs w-48">Overall Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredLeaderboard.length > 0 ? (
                        filteredLeaderboard.map((rank, idx) => (
                          <tr key={rank.id} className={`transition-colors group hover:bg-gray-50/50 ${idx < 3 && selectedClassFilter === 'All Classes' && !searchQuery ? 'bg-amber-50/20' : ''}`}>
                            <td className="p-4 text-center">
                              {(idx === 0 && selectedClassFilter === 'All Classes' && !searchQuery) ? (
                                <Medal className="w-6 h-6 text-yellow-500 mx-auto drop-shadow-sm" />
                              ) : (idx === 1 && selectedClassFilter === 'All Classes' && !searchQuery) ? (
                                <Medal className="w-6 h-6 text-slate-400 mx-auto drop-shadow-sm" />
                              ) : (idx === 2 && selectedClassFilter === 'All Classes' && !searchQuery) ? (
                                <Medal className="w-6 h-6 text-amber-700 mx-auto drop-shadow-sm" />
                              ) : (
                                <span className="font-bold text-gray-500 group-hover:text-[#002147] transition-colors">{idx + 1}</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-inner ${
                                  (idx === 0 && selectedClassFilter === 'All Classes' && !searchQuery) ? 'bg-gradient-to-br from-yellow-100 to-yellow-300 text-yellow-800' :
                                  (idx === 1 && selectedClassFilter === 'All Classes' && !searchQuery) ? 'bg-gradient-to-br from-slate-100 to-slate-300 text-slate-800' :
                                  (idx === 2 && selectedClassFilter === 'All Classes' && !searchQuery) ? 'bg-gradient-to-br from-amber-100 to-amber-300 text-amber-900' :
                                  'bg-gradient-to-br from-indigo-100 to-blue-200 text-indigo-700'
                                }`}>
                                  {rank.studentName.charAt(0)}
                                </div>
                                <span className="font-bold text-[#002147]">{rank.studentName}</span>
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-500">{rank.className}</td>
                            <td className="p-4 text-center font-bold text-indigo-600">{rank.assignmentsAppeared}</td>
                            <td className="p-4 text-right">
                              <span className="font-bold text-[#002147]">{rank.totalMarksObtained}</span>
                              <span className="text-gray-400 text-xs ml-1">/ {rank.totalMaxMarks}</span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${getProgressBg(rank.averagePercentage)}`}>
                                  <div 
                                    className={`h-full rounded-full ${getProgressColor(rank.averagePercentage)} transition-all duration-1000 ease-out`} 
                                    style={{ width: `${rank.averagePercentage}%` }}
                                  />
                                </div>
                                <span className={`font-bold text-xs w-10 text-right ${
                                  rank.averagePercentage >= 80 ? 'text-emerald-600' :
                                  rank.averagePercentage >= 60 ? 'text-amber-600' : 'text-rose-600'
                                }`}>
                                  {Math.round(rank.averagePercentage)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-12 text-center">
                            <div className="flex flex-col items-center justify-center space-y-3">
                              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-gray-400" />
                              </div>
                              <p className="text-gray-500 font-medium">No results found.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
