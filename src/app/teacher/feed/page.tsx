import { AlertTriangle, Info, CheckCircle2, MessageCircle } from 'lucide-react';

export default function SituationalFeedPage() {
  const events = [
    { type: 'alert', title: 'Tab Switch Detected', student: 'Aryan K.', time: '2 mins ago', detail: 'Switched tabs for 12 seconds during Quadratic Equations Homework.' },
    { type: 'success', title: 'Homework Completed', student: 'Priya S.', time: '15 mins ago', detail: 'Completed Quadratic Equations HW with 92% AI-estimated accuracy.' },
    { type: 'info', title: 'Doubt Raised', student: 'Rahul V.', time: '1 hour ago', detail: 'Raised doubt at 03:14 in "Factorization Method" video. AI Tutor resolved it.' },
    { type: 'alert', title: 'Low Energy Check', student: 'Sneha M.', time: '2 hours ago', detail: 'Reported low energy during morning login. Wellness check suggested.' },
    { type: 'success', title: 'Challenge Mode Unlocked', student: 'Rohan D.', time: '3 hours ago', detail: 'Mastery score crossed 90%. Next homework will feature Challenge questions.' },
  ];

  return (
    <div className="max-w-4xl animate-in fade-in duration-500 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[#002147]">Situational Feed</h2>
          <p className="text-[#002147]/60">Real-time updates on student progress and proctoring alerts.</p>
        </div>
        <div className="flex space-x-2">
          <button className="px-4 py-2 text-sm font-medium bg-[#002147]/5 text-[#002147] rounded-lg hover:bg-[#002147]/10">All</button>
          <button className="px-4 py-2 text-sm font-medium bg-[#dc143c]/10 text-[#dc143c] rounded-lg hover:bg-[#dc143c]/20">Alerts</button>
        </div>
      </div>

      <div className="space-y-4">
        {events.map((event, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/5 flex items-start space-x-4 hover:border-[#002147]/20 transition-colors cursor-pointer">
            <div className={`p-3 rounded-xl flex-shrink-0 ${
              event.type === 'alert' ? 'bg-[#dc143c]/10 text-[#dc143c]' :
              event.type === 'success' ? 'bg-green-100 text-green-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              {event.type === 'alert' ? <AlertTriangle className="w-6 h-6" /> :
               event.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> :
               <Info className="w-6 h-6" />}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-[#002147] text-lg">{event.title}</h3>
                <span className="text-sm font-mono text-[#002147]/40">{event.time}</span>
              </div>
              <div className="text-sm font-semibold text-[#002147]/80 mt-1">{event.student}</div>
              <p className="text-[#002147]/60 mt-2">{event.detail}</p>
              
              {event.type === 'alert' && (
                <div className="mt-4 flex space-x-3">
                  <button className="text-sm px-4 py-2 bg-[#dc143c] text-white rounded-lg hover:bg-[#dc143c]/90 transition-colors">Acknowledge</button>
                  <button className="text-sm px-4 py-2 bg-white border border-[#002147]/20 text-[#002147] rounded-lg hover:bg-[#002147]/5 flex items-center space-x-2">
                    <MessageCircle className="w-4 h-4" />
                    <span>Message Student</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
