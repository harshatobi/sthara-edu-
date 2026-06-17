'use client';

import { useState, useEffect } from 'react';
import { Building2, Users, FileVideo, PlusCircle, X } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface School {
  id: string;
  name: string;
  adminEmail: string;
  studentsCount: number;
  status: string;
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [schoolCode, setSchoolCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchSchools = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'schools'));
      const schoolsList: School[] = [];
      querySnapshot.forEach((doc) => {
        schoolsList.push({ id: doc.id, ...doc.data() } as School);
      });
      setSchools(schoolsList);
    } catch (err) {
      console.error("Error fetching schools", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const handleOnboardSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!schoolCode || !institutionName || !adminEmail) {
      setError("Please fill all fields");
      setIsSubmitting(false);
      return;
    }

    try {
      // Write to Firestore
      await setDoc(doc(db, 'schools', schoolCode.toUpperCase()), {
        name: institutionName,
        adminEmail,
        studentsCount: 0,
        status: 'Active',
        createdAt: serverTimestamp()
      });

      // Refresh list and close modal
      await fetchSchools();
      setIsModalOpen(false);
      setSchoolCode('');
      setInstitutionName('');
      setAdminEmail('');
    } catch (err: any) {
      setError(err.message || "Failed to onboard school");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">Global Overview</h1>
          <p className="text-[#002147]/60 mt-1">Platform-wide metrics across all onboarded institutions.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#dc143c] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 hover:bg-[#dc143c]/90 transition-colors shadow-sm shadow-[#dc143c]/20"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Onboard New School</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 flex items-center space-x-4">
          <div className="p-4 bg-[#002147]/5 rounded-xl">
            <Building2 className="w-8 h-8 text-[#002147]" />
          </div>
          <div>
            <p className="text-sm text-[#002147]/60 font-medium">Active Schools</p>
            <p className="text-2xl font-bold text-[#002147]">{loading ? '...' : schools.length}</p>
          </div>
        </div>
        {/* Placeholder stats for now */}
        <Link href="/superadmin/directory" className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 flex items-center space-x-4 hover:bg-[#f8fafc] transition-colors cursor-pointer group">
          <div className="p-4 bg-green-50 rounded-xl group-hover:scale-105 transition-transform">
            <Users className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-[#002147]/60 font-medium">Global Student Directory</p>
            <p className="text-2xl font-bold text-[#002147]">View All</p>
          </div>
        </Link>
        <Link href="/superadmin/content" className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 flex items-center space-x-4 hover:bg-[#f8fafc] transition-colors cursor-pointer group">
          <div className="p-4 bg-purple-50 rounded-xl group-hover:scale-105 transition-transform">
            <FileVideo className="w-8 h-8 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-[#002147]/60 font-medium">Global Video CMS</p>
            <p className="text-2xl font-bold text-[#002147]">Manage</p>
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
        <div className="p-6 border-b border-[#002147]/5">
          <h2 className="text-lg font-bold text-[#002147]">Recent School Onboardings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#002147]/80">
            <thead className="bg-[#f8fafc] text-xs uppercase font-semibold text-[#002147]/60 border-b border-[#002147]/10">
              <tr>
                <th className="px-6 py-4">School Code</th>
                <th className="px-6 py-4">Institution Name</th>
                <th className="px-6 py-4">Admin Email</th>
                <th className="px-6 py-4">Students</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-[#002147]/50">Loading schools...</td>
                </tr>
              ) : schools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-[#002147]/50">No schools onboarded yet. Click "Onboard New School" to start.</td>
                </tr>
              ) : (
                schools.map((school) => (
                  <tr 
                    key={school.id} 
                    onClick={() => router.push(`/superadmin/schools/manage?id=${school.id}`)}
                    className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-bold text-[#002147]">{school.id}</td>
                    <td className="px-6 py-4">{school.name}</td>
                    <td className="px-6 py-4">{school.adminEmail}</td>
                    <td className="px-6 py-4">{school.studentsCount || 0}</td>
                    <td className="px-6 py-4">
                      <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">{school.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onboarding Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#002147]/10 flex justify-between items-center bg-[#f8fafc]">
              <h3 className="text-xl font-bold text-[#002147]">Onboard New School</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[#002147]/40 hover:text-[#dc143c] transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleOnboardSchool} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#002147]/70 mb-1">Institution Name</label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="e.g. Sthara Demo Academy"
                    className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#002147]/70 mb-1">School Code (Unique ID)</label>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g. STHARA-001"
                    className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#002147]/70 mb-1">Primary Admin Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="principal@stharademo.edu"
                    className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                  />
                </div>
                
                {error && <p className="text-[#dc143c] text-sm text-center bg-[#dc143c]/10 p-2 rounded-lg">{error}</p>}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#002147] text-white py-3 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors mt-6 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Onboard Institution'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
