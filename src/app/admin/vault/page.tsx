import { Download, ShieldCheck, FileCheck2, Users } from 'lucide-react';

export default function RegulatoryVaultPage() {
  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">2026 Regulatory Vault</h2>
          <p className="text-[#002147]/60 mt-1">One-click generation of mandatory CBSE compliance reports.</p>
        </div>
        <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl flex items-center space-x-2 font-medium">
          <ShieldCheck className="w-5 h-5" />
          <span>Fully Compliant</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ReportCard 
          title="CBSE Wellness Report" 
          description="Aggregated student wellness and mental health metrics for Q1 2026." 
          icon={FileCheck2} 
        />
        <ReportCard 
          title="Staff Training Logs" 
          description="Mandatory NEP 2020 professional development hours logged by teachers." 
          icon={Users} 
        />
        <ReportCard 
          title="Infrastructure Audit" 
          description="Automated digital infrastructure and proctoring reliability report." 
          icon={ShieldCheck} 
        />
      </div>
    </div>
  );
}

function ReportCard({ title, description, icon: Icon }: any) {
  return (
    <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#002147]/5 group-hover:bg-[#002147] group-hover:text-white transition-colors text-[#002147]">
            <Icon className="w-6 h-6" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-[#002147] mb-2">{title}</h3>
        <p className="text-[#002147]/60 text-sm mb-6">{description}</p>
      </div>
      <button className="w-full py-3 border border-[#002147]/20 rounded-xl font-medium text-[#002147] hover:bg-[#002147] hover:text-white transition-colors flex justify-center items-center space-x-2">
        <Download className="w-4 h-4" />
        <span>Generate PDF</span>
      </button>
    </div>
  );
}
