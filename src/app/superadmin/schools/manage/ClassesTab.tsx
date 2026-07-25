'use client';

import { useState, useEffect } from 'react';
import { Plus, Upload, X, Loader2, BookOpen, Users, ArrowLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ClassesTab({ schoolId, institutionType, allUsers }: { schoolId: string; institutionType: 'school' | 'college'; allUsers: any[] }) {
  const supabase = createClient();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, [schoolId]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId);

      setClasses(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) return <div className="p-6 text-center text-gray-400">Loading Classes...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[#002147]">Enrolled Classes ({classes.length})</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {classes.map((cls, idx) => (
          <div key={cls.id || idx} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
            <div className="font-bold text-[#002147] text-base">{cls.name || cls.class_name || 'Class'}</div>
            <div className="text-xs text-gray-500">Section/Branch: {cls.section || cls.branch || 'General'}</div>
          </div>
        ))}

        {classes.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No specific classes configured for this institution yet.
          </div>
        )}
      </div>
    </div>
  );
}
