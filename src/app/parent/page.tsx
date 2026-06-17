'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Star, TrendingUp, Trophy, LogOut, Loader2, BookOpen, Clock } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface Child {
  id: string;
  name: string;
  studentClass: string;
  customStudentId: string;
  assignments: any[];
}

export default function ParentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.linkedStudents || profile.linkedStudents.length === 0) {
      setLoadingData(false);
      return;
    }

    const fetchChildrenAndTasks = async () => {
      try {
        // 1. Fetch children profiles based on customStudentId
        const usersRef = collection(db, 'schools', profile.schoolId, 'users');
        // Firestore 'in' query supports up to 10 items. Safe for a parent's children.
        const qUsers = query(usersRef, where('customStudentId', 'in', profile.linkedStudents));
        const usersSnap = await getDocs(qUsers);
        
        const childrenMap: Record<string, Child> = {};
        const classesToFetch = new Set<string>();
        
        usersSnap.forEach(doc => {
          const data = doc.data();
          if (data.role === 'student' && data.studentClass) {
            childrenMap[data.studentClass] = childrenMap[data.studentClass] || [];
            
            const childObj = {
              id: doc.id,
              name: data.name,
              studentClass: data.studentClass,
              customStudentId: data.customStudentId,
              assignments: []
            };
            
            // Temporary map using student ID as key to attach assignments later
            childrenMap[doc.id] = childObj;
            classesToFetch.add(data.studentClass);
          }
        });

        // 2. Fetch assignments for the identified classes
        const assignmentsRef = collection(db, 'schools', profile.schoolId, 'assignments');
        if (classesToFetch.size > 0) {
          const qAssignments = query(assignmentsRef, where('class', 'in', Array.from(classesToFetch)));
          const assignSnap = await getDocs(qAssignments);
          
          assignSnap.forEach(doc => {
            const data = doc.data();
            const assignClass = data.class;
            
            // Add this assignment to all children in this class
            Object.values(childrenMap).forEach(child => {
              if (child.studentClass === assignClass) {
                child.assignments.push({ id: doc.id, ...data });
              }
            });
          });
        }
        
        // 3. Sort assignments for each child by due date
        const finalChildrenList = Object.values(childrenMap);
        finalChildrenList.forEach(child => {
          child.assignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        });

        setChildrenData(finalChildrenList);
      } catch (err) {
        console.error("Error fetching parent dashboard data:", err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchChildrenAndTasks();
  }, [profile?.schoolId, profile?.linkedStudents]);

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Parent Portal...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Welcome, {profile.name?.split(' ')[0]}</h2>
          <p className="text-[#002147]/60 mt-1">Parent Portal • {profile.schoolId}</p>
        </div>
        <button 
          onClick={signOut}
          className="flex items-center space-x-2 bg-white border border-[#002147]/10 px-4 py-3 rounded-xl shadow-sm hover:bg-[#f8fafc] text-[#dc143c] transition-colors font-medium"
        >
          <LogOut className="w-5 h-5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>

      <div className="text-xl font-bold text-[#002147] border-b border-[#002147]/10 pb-2">Your Linked Children</div>

      {loadingData ? (
        <div className="flex justify-center items-center py-12 text-[#002147]/50">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          <span className="text-lg">Fetching student records...</span>
        </div>
      ) : childrenData.length === 0 ? (
        <div className="bg-white border border-[#002147]/10 p-8 rounded-2xl shadow-sm text-center">
          <div className="w-16 h-16 bg-[#f8fafc] border border-[#002147]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-[#002147]/40" />
          </div>
          <h3 className="text-xl font-bold text-[#002147] mb-2">No Students Linked</h3>
          <p className="text-[#002147]/60">Your account has not been linked to any students yet. Please contact the school administrator.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {childrenData.map((child) => (
            <div key={child.id} className="bg-white border border-[#002147]/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              
              {/* Child Header */}
              <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 text-white flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                    <span className="text-xl font-bold">{child.name.charAt(0)}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{child.name}</h3>
                    <p className="text-white/70 font-medium">Class {child.studentClass} • ID: {child.customStudentId}</p>
                  </div>
                </div>
                <div className="hidden md:block bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
                  <span className="text-sm font-medium text-white/80 uppercase tracking-wider block">Overall Mastery</span>
                  <span className="text-2xl font-bold text-green-400">84%</span>
                </div>
              </div>

              {/* Child Assignments Feed */}
              <div className="p-6 bg-[#f8fafc]">
                <h4 className="text-[#002147] font-bold mb-4 flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-[#dc143c]" />
                  <span>Active Tasks & Homework</span>
                </h4>
                
                {child.assignments.length === 0 ? (
                  <div className="text-center py-6 bg-white rounded-xl border border-dashed border-[#002147]/20 text-[#002147]/50">
                    No pending tasks for {child.name.split(' ')[0]} at the moment.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {child.assignments.map(task => (
                      <div key={task.id} className="bg-white border border-[#002147]/10 p-4 rounded-xl flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="bg-[#002147]/5 text-[#002147] text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">
                              {task.subject}
                            </span>
                            <span className="text-xs text-[#002147]/40 uppercase font-bold tracking-wider">
                              {task.type}
                            </span>
                          </div>
                          <h5 className="font-bold text-[#002147] mt-2">{task.title}</h5>
                          <p className="text-sm text-[#002147]/70 mt-1 line-clamp-2">{task.description}</p>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <div className="flex items-center space-x-1 text-[#dc143c] bg-[#dc143c]/10 px-3 py-1 rounded-lg">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm font-bold">Due {task.dueDate}</span>
                          </div>
                          <div className="text-xs text-[#002147]/40 font-medium mt-2">By {task.teacherName}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
