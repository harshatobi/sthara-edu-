import { BookHeart, PlayCircle, Info } from 'lucide-react';

export default function SensitizationPage() {
  const resources = [
    { title: "Understanding Screen Time Limits", category: "Mental Health", readTime: "5 min read" },
    { title: "How to Support Math Anxiety", category: "Academic Support", readTime: "8 min read" },
    { title: "Navigating Teen Peer Pressure", category: "Holistic Development", readTime: "10 min read" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Parent Sensitization Portal</h2>
        <p className="text-[#002147]/60 mt-1">Resources for mental health literacy and holistic development.</p>
      </div>

      <div className="bg-[#002147] text-white p-8 rounded-2xl shadow-xl flex items-center justify-between relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="z-10 max-w-lg">
          <span className="bg-[#dc143c] text-white text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block">Featured Video</span>
          <h3 className="text-2xl font-bold mb-2">The Adolescent Brain: What to Expect</h3>
          <p className="text-white/80 mb-6">Dr. Arati Sharma explains the cognitive changes happening in 10th grade and how to provide supportive parenting.</p>
          <button className="bg-white text-[#002147] px-6 py-3 rounded-xl font-bold hover:bg-white/90 transition-colors flex items-center space-x-2">
            <PlayCircle className="w-5 h-5" />
            <span>Watch Masterclass</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {resources.map((res, i) => (
          <div key={i} className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[#dc143c] uppercase tracking-wider mb-2">{res.category}</div>
              <h4 className="text-lg font-bold text-[#002147] mb-2">{res.title}</h4>
            </div>
            <div className="flex items-center justify-between mt-6">
              <span className="text-sm font-medium text-[#002147]/60 flex items-center space-x-1">
                <BookHeart className="w-4 h-4" />
                <span>{res.readTime}</span>
              </span>
              <button className="text-[#002147] font-semibold hover:underline text-sm">Read Article</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-[#002147]/5 border border-[#002147]/10 p-6 rounded-2xl flex items-start space-x-4">
        <Info className="w-6 h-6 text-[#002147] flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-[#002147]">Monthly Counselor Connect</h4>
          <p className="text-[#002147]/80 text-sm mt-1">
            Schedule a 15-minute 1-on-1 virtual connect with Aryan's assigned school counselor to discuss holistic progress. 
            Available every 3rd Saturday of the month.
          </p>
          <button className="mt-4 bg-white border border-[#002147]/20 text-[#002147] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[#002147]/5 transition-colors">
            Book Appointment
          </button>
        </div>
      </div>
    </div>
  );
}
