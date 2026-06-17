export default function WellnessPage() {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#002147]/10 animate-in fade-in duration-500">
      <h2 className="text-2xl font-bold text-[#002147] mb-4">Wellness Center</h2>
      <p className="text-[#002147]/60">Your mental health and well-being matters. Track your daily energy and access resources here.</p>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5">
          <h3 className="font-semibold text-[#002147] mb-4">Energy History (This Week)</h3>
          <div className="flex justify-between items-end h-32 mt-4 space-x-2">
            {[60, 40, 80, 90, 75].map((height, i) => (
              <div key={i} className="w-full flex flex-col items-center group">
                <div 
                  className="w-full bg-[#002147]/20 rounded-t-sm group-hover:bg-[#dc143c] transition-colors" 
                  style={{ height: `${height}%` }}
                ></div>
                <div className="text-xs text-[#002147]/50 mt-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5">
          <h3 className="font-semibold text-[#002147] mb-4">Quick Resources</h3>
          <ul className="space-y-3">
            <li className="flex items-center space-x-3 text-[#002147]/80 hover:text-[#dc143c] cursor-pointer">
              <span>🧘‍♂️</span>
              <span>5-Minute Breathing Exercise</span>
            </li>
            <li className="flex items-center space-x-3 text-[#002147]/80 hover:text-[#dc143c] cursor-pointer">
              <span>🎧</span>
              <span>Focus Music Playlist</span>
            </li>
            <li className="flex items-center space-x-3 text-[#002147]/80 hover:text-[#dc143c] cursor-pointer">
              <span>💬</span>
              <span>Chat with School Counselor</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
