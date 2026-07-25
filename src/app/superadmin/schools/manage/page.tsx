'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, GraduationCap, Users, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ManageSchoolPage() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get('id');
  const router = useRouter();
  const supabase = createClient();

  const [school, setSchool] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('*')
          .eq('id', schoolId)
          .single();

        setSchool(schoolData);

        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', schoolId);

        setUsers(usersData || []);
      } catch (err: any) {
        console.error('[manage-school] error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolId]);

  if (loading) return <div className="p-10 text-center text-[#002147] font-medium">Loading Institution Management...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/superadmin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">{school?.name || 'Institution Management'}</h1>
          <p className="text-gray-500 text-sm mt-1">School ID: {schoolId}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-[#002147]">Enrolled Users ({users.length})</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Name</th>
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Email</th>
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-bold text-sm text-[#002147]">{u.name}</td>
                  <td className="p-4 text-xs text-gray-500">{u.email}</td>
                  <td className="p-4 text-xs font-bold capitalize text-indigo-600">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
