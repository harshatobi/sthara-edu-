'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default function StudentHomework() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomework = async () => {
      if (!profile?.id) return;
      try {
        const q = query(
          collection(db, 'homework_assignments'),
          where('studentId', '==', profile.id),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items: any[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        setAssignments(items);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [profile]);

  if (loading || !profile) return <div className="p-10 text-center animate-pulse">Loading assignments...</div>;

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-[#002147]">My Assignments</h1>
        <p className="text-[#002147]/60 mt-1">Personalized homework generated just for you.</p>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-[#002147]/10 flex flex-col items-center justify-center text-center">
          <BookOpen className="w-12 h-12 text-[#002147]/20 mb-4" />
          <h2 className="text-xl font-bold text-[#002147]">No Homework Yet</h2>
          <p className="text-[#002147]/60 mt-2">When your teacher assigns a topic, your custom homework will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assignments.map(a => (
            <Link key={a.id} href={`/student/homework/${a.id}`} className="block">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${a.status === 'completed' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                <div className="flex justify-between items-start pl-2">
                  <div>
                    <h3 className="font-bold text-[#002147] text-lg">{a.topic}</h3>
                    <p className="text-[#002147]/60 text-sm mt-1">{a.subject}</p>
                  </div>
                  {a.status === 'completed' ? (
                    <span className="flex items-center space-x-1 text-green-600 bg-green-50 px-2 py-1 rounded-md text-xs font-bold">
                      <CheckCircle className="w-3 h-3" />
                      <span>Graded</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-md text-xs font-bold">
                      <Clock className="w-3 h-3" />
                      <span>Pending</span>
                    </span>
                  )}
                </div>
                {a.status === 'completed' && a.grade && (
                  <div className="mt-4 pt-4 border-t border-[#002147]/5 pl-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#002147]/70">Score</span>
                    <span className="text-xl font-black text-[#002147]">{a.grade}</span>
                  </div>
                )}
                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#002147]/40 text-sm font-semibold">
                  {a.status === 'completed' ? 'View Feedback →' : 'Start Assessment →'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
