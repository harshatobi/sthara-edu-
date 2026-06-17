import { Info } from 'lucide-react';

// Mock data for heat map
const students = [
  "Aryan K.", "Priya S.", "Rahul V.", "Sneha M.", "Rohan D.", 
  "Ananya P.", "Vikram T.", "Nisha R.", "Aditya C.", "Kavya N."
];

const subtopics = [
  "Factorization", "Completing Square", "Quadratic Formula", "Nature of Roots", "Word Problems"
];

// Generate mock scores (0-100)
const generateScore = () => Math.floor(Math.random() * 40) + 60; // 60-100

const getColorForScore = (score: number) => {
  if (score >= 90) return 'bg-green-100 text-green-800 border-green-200'; // Mastered
  if (score >= 75) return 'bg-yellow-100 text-yellow-800 border-yellow-200'; // Proficient
  return 'bg-[#dc143c]/10 text-[#dc143c] border-[#dc143c]/20'; // Needs Help
};

export default function HeatMapPage() {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#002147]/10 animate-in fade-in duration-500 overflow-x-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#002147]">Class Topic-Wise Heat Map</h2>
          <p className="text-[#002147]/60">Granular view of student mastery across sub-topics.</p>
        </div>
        <div className="flex items-center space-x-4 text-sm font-medium">
          <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-green-400 rounded-sm"></div><span>&gt;90%</span></div>
          <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div><span>75-90%</span></div>
          <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-[#dc143c] rounded-sm opacity-60"></div><span>&lt;75%</span></div>
        </div>
      </div>

      <div className="min-w-[800px]">
        <div className="grid grid-cols-6 gap-2 mb-2">
          <div className="font-bold text-[#002147]/60 p-2">Student</div>
          {subtopics.map(topic => (
            <div key={topic} className="font-bold text-[#002147]/80 p-2 text-center text-sm border-b border-[#002147]/10">
              {topic}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {students.map((student) => (
            <div key={student} className="grid grid-cols-6 gap-2 items-center hover:bg-[#f8fafc] p-2 rounded-xl transition-colors">
              <div className="font-medium text-[#002147]">{student}</div>
              {subtopics.map(topic => {
                const score = generateScore();
                return (
                  <div 
                    key={topic} 
                    className={`p-3 rounded-lg border text-center font-bold ${getColorForScore(score)} transition-transform hover:scale-105 cursor-pointer`}
                    title={`Click to view detailed analytics for ${student} on ${topic}`}
                  >
                    {score}%
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-8 bg-[#002147]/5 p-4 rounded-xl flex items-start space-x-3">
        <Info className="w-5 h-5 text-[#002147] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#002147]/80">
          <strong>AI Insight:</strong> 40% of the class is struggling with "Nature of Roots". The adaptive engine has automatically scheduled a 5-minute refresher video for these students before their next homework assignment.
        </p>
      </div>
    </div>
  );
}
