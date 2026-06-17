'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Users, Search, Download, Loader2, Copy, Check } from 'lucide-react';
import Link from 'next/link';

interface StudentData {
  id: string;
  name: string;
  email: string;
  plainTextPassword?: string;
  schoolId: string;
  studentClass: string;
  customStudentId: string;
}

export default function SuperAdminDirectory() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<StudentData[]>([]);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const fetchAllStudents = async () => {
    try {
      const q = query(collection(db, 'global_users'), where('role', '==', 'student'));
      const snap = await getDocs(q);
      const list: StudentData[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as StudentData);
      });
      
      list.sort((a, b) => {
        if (a.schoolId !== b.schoolId) return a.schoolId.localeCompare(b.schoolId);
        if (a.studentClass !== b.studentClass) return a.studentClass.localeCompare(b.studentClass);
        return (a.customStudentId || '').localeCompare(b.customStudentId || '');
      });
      
      setStudents(list);
    } catch (err) {
      console.error("Error fetching students:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'superadmin') {
      fetchAllStudents();
    }
  }, [profile]);

  const handleBulkGenerate = async () => {
    if (!confirm("Are you sure you want to generate ~40 demo students?")) return;
    setIsGenerating(true);
    setGenStatus('Initializing Secondary App...');
    
    try {
      // Dynamically import to avoid messing up regular imports
      const { initializeApp, getApps } = await import('firebase/app');
      const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
      const { getFirestore, setDoc, doc, serverTimestamp } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };

      // Create secondary app
      const apps = getApps();
      const secondaryApp = apps.find(a => a.name === 'SecondaryApp') || initializeApp(firebaseConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);
      const primaryDb = db; // We use the primary authenticated DB to write the documents since SuperAdmin has rights

      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      setGenStatus('Generating Schools...');
      const schools = ['DEMO-01', 'DEMO-02'];
      const classes = ['10A', '10B'];
      let studentCount = 1;

      for (let s = 1; s <= 2; s++) {
        const schoolId = `DEMO-0${s}`;
        await setDoc(doc(primaryDb, 'schools', schoolId), {
          name: `Sthara Demo Academy ${s}`,
          adminEmail: `admin@${schoolId.toLowerCase()}.edu`,
          studentsCount: 20,
          status: 'Active',
          createdAt: serverTimestamp()
        });

        // Create Admin for school
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, `principal@${schoolId.toLowerCase()}.edu`, `Admin${schoolId}!`);
          const adminData = {
            name: `Principal of ${schoolId}`,
            role: 'admin',
            schoolId,
            email: `principal@${schoolId.toLowerCase()}.edu`,
            plainTextPassword: `Admin${schoolId}!`
          };
          await setDoc(doc(primaryDb, 'global_users', cred.user.uid), adminData);
          await setDoc(doc(primaryDb, 'schools', schoolId, 'users', cred.user.uid), adminData);
        } catch(e) {}

        for (const cls of classes) {
          setGenStatus(`Generating ${schoolId} ${cls}...`);
          for (let i = 1; i <= 10; i++) {
            const email = `student${studentCount}@${schoolId.toLowerCase()}.edu`;
            const pass = `Pass${studentCount}!`;
            try {
              const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
              const studentData = {
                name: `Demo Student ${studentCount}`,
                role: 'student',
                studentClass: cls,
                customStudentId: `${schoolId}-${cls}-${String(i).padStart(3, '0')}`,
                schoolId,
                email,
                plainTextPassword: pass,
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(primaryDb, 'global_users', userCred.user.uid), studentData);
              await setDoc(doc(primaryDb, 'schools', schoolId, 'users', userCred.user.uid), studentData);
            } catch (err: any) {
              if (err.code === 'auth/too-many-requests') {
                setGenStatus('Rate limit hit. Waiting 5s...');
                await delay(5000);
              }
            }
            studentCount++;
            await delay(300); // Prevent client-side rate limit triggers
          }
        }
      }
      setGenStatus('Success! 40 Students Generated.');
      await fetchAllStudents();
    } catch (err: any) {
      console.error(err);
      setGenStatus(`Failed: ${err.message}`);
    }
    setIsGenerating(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.schoolId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.studentClass?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center">Loading Directory...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">Global Student Directory</h1>
          <p className="text-[#002147]/60 mt-1">Master list of all student accounts and credentials across all schools.</p>
        </div>
        <div className="flex space-x-3 items-center">
          {genStatus && <span className="text-sm font-semibold text-[#dc143c] bg-[#dc143c]/10 px-3 py-1 rounded-full">{genStatus}</span>}
          <button 
            onClick={handleBulkGenerate}
            disabled={isGenerating}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isGenerating ? 'Generating...' : 'Generate 120 Demo Students'}
          </button>
          <Link href="/superadmin" className="px-4 py-2 bg-white border border-[#002147]/10 rounded-xl text-[#002147] font-medium shadow-sm hover:bg-[#f8fafc]">
            Back to Dashboard
          </Link>
          <button className="bg-[#002147] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 hover:bg-[#002147]/90 shadow-sm">
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
        <div className="p-4 border-b border-[#002147]/5 bg-[#f8fafc] flex justify-between items-center">
          <div className="relative w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[#002147]/40" />
            </div>
            <input
              type="text"
              placeholder="Search by name, school, class..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-[#002147]/10 rounded-lg text-sm bg-white text-[#002147] placeholder-[#002147]/40 focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
            />
          </div>
          <div className="text-sm font-bold text-[#002147]/60">
            Total Records: {filteredStudents.length}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-sm text-[#002147]/80 relative">
            <thead className="bg-[#f8fafc] text-xs uppercase font-semibold text-[#002147]/60 border-b border-[#002147]/10 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4">Student Name</th>
                <th className="px-6 py-4">School & Class</th>
                <th className="px-6 py-4">Login Email</th>
                <th className="px-6 py-4">Plain Text Password</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#002147]/50">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Fetching all global records...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#002147]/50">No students found.</td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#002147]">{student.name}</div>
                      <div className="text-xs text-[#002147]/40 font-mono">{student.customStudentId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-[#002147]/5 text-[#002147] px-2 py-1 rounded font-bold text-xs">{student.schoolId}</span>
                      <span className="ml-2 font-medium">{student.studentClass}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{student.email}</td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs bg-yellow-50 text-yellow-800 px-2 py-1 rounded border border-yellow-200">
                        {student.plainTextPassword || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => copyToClipboard(`Email: ${student.email}\nPassword: ${student.plainTextPassword}`, student.id)}
                        className="text-[#002147]/40 hover:text-[#002147] transition-colors flex items-center space-x-1 text-xs font-semibold bg-white border border-[#002147]/10 px-2 py-1 rounded-md shadow-sm"
                      >
                        {copiedId === student.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === student.id ? 'Copied' : 'Copy Creds'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
