'use client';

import { BookHeart, PlayCircle, Info, CheckSquare, ShieldCheck, HeartHandshake, Phone, ExternalLink, X, Loader2, CheckCircle2, Calendar, MapPin, User, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SensitizationPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [playingVideo, setPlayingVideo] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [bookingState, setBookingState] = useState<'idle' | 'booking' | 'booked'>('idle');
  const [showBookingDetails, setShowBookingDetails] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) return null;

  const resources = [
    { title: "Understanding Screen Time Limits", category: "Mental Health", readTime: "5 min read", type: "Article", iframeUrl: "https://en.wikipedia.org/wiki/Screen_time" },
    { title: "How to Support Math Anxiety", category: "Academic Support", readTime: "8 min read", type: "Guide", iframeUrl: "https://en.wikipedia.org/wiki/Mathematical_anxiety" },
    { title: "Navigating Teen Peer Pressure", category: "Holistic Development", readTime: "10 min read", type: "Article", iframeUrl: "https://en.wikipedia.org/wiki/Peer_pressure" },
    { title: "Digital Citizenship for 10th Graders", category: "Cyber Safety", readTime: "15 min video", type: "Video", iframeUrl: "https://en.wikipedia.org/wiki/Digital_citizen" },
  ];

  const handleBook = () => {
    setBookingState('booking');
    setTimeout(() => {
      setBookingState('booked');
      setShowBookingDetails(true);
    }, 1500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16 relative">
      
      {/* Header */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute left-0 bottom-0 w-64 h-64 bg-gradient-to-tr from-rose-100 to-orange-50 rounded-full blur-3xl -ml-20 -mb-20 opacity-60"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <HeartHandshake className="w-4 h-4" />
            <span>NEP 2020 Mandate</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#002147]">Parent Sensitization</h2>
          <p className="text-gray-500 font-medium mt-1 text-lg">Resources to support your child's holistic and emotional well-being.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Video & Resources */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Featured Masterclass */}
          <div className="bg-gradient-to-r from-[#002147] to-indigo-900 text-white rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden min-h-[350px]">
            <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
            
            {playingVideo ? (
              <div className="absolute inset-0 z-30 bg-black">
                <iframe 
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/6zVS8HIPUng?autoplay=1" 
                  title="YouTube video player" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
            ) : (
              <>
                <div 
                  onClick={() => setPlayingVideo(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-all cursor-pointer group z-20"
                >
                  <div className="bg-white/20 p-4 rounded-full backdrop-blur-md group-hover:scale-110 transition-transform">
                    <PlayCircle className="w-16 h-16 text-white" />
                  </div>
                </div>
                
                <div className="z-10 h-full flex flex-col justify-between p-8 pointer-events-none">
                  <span className="bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-lg mb-4 inline-block w-max tracking-wider uppercase shadow-sm">
                    Mandatory Module
                  </span>
                  <div className="mt-auto">
                    <h3 className="text-3xl font-bold mb-3 leading-tight text-white">The Adolescent Brain: What to Expect in 10th Grade</h3>
                    <p className="text-indigo-100 mb-6 max-w-lg leading-relaxed text-sm">
                      Dr. Arati Sharma explains the cognitive changes happening during this crucial year, how it affects their mood, and how to provide supportive, non-reactive parenting.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Resource Library */}
          <div>
            <h3 className="text-xl font-bold text-[#002147] mb-4 flex items-center space-x-2">
              <BookHeart className="w-6 h-6 text-indigo-500" />
              <span>Recommended Reading</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {resources.map((res, i) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedArticle(res)}
                  className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:border-indigo-200 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-md">
                      {res.category}
                    </div>
                    {res.type === 'Video' ? <PlayCircle className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" /> : <BookHeart className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />}
                  </div>
                  <h4 className="text-lg font-bold text-[#002147] mb-3 leading-tight group-hover:text-indigo-600 transition-colors">{res.title}</h4>
                  <div className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {res.readTime}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Checklists & Support */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Action Checklist */}
          <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
            <h4 className="font-bold text-[#002147] mb-6 flex items-center space-x-2 border-b border-gray-100 pb-4">
              <CheckSquare className="w-5 h-5 text-emerald-500" />
              <span>Weekly Checklist</span>
            </h4>
            <div className="space-y-4">
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" defaultChecked />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Ask about the best part of their day</span>
              </label>
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" defaultChecked />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Review screen-time limits</span>
              </label>
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Ensure 1 hour of physical activity</span>
              </label>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '66%' }}></div>
              </div>
              <p className="text-xs font-bold text-gray-400 mt-2 text-right uppercase">2 of 3 Completed</p>
            </div>
          </div>

          {/* Counselor Connect */}
          <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl shadow-sm relative">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 border border-amber-200">
              <Phone className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-amber-900 mb-2">Counselor Connect</h4>
            <p className="text-amber-800/80 text-sm leading-relaxed mb-6">
              Schedule a 15-minute virtual connect with your child's assigned school counselor to discuss holistic progress. Available every 3rd Saturday.
            </p>
            
            <button 
              onClick={bookingState === 'booked' ? () => setShowBookingDetails(true) : handleBook}
              disabled={bookingState === 'booking'}
              className={`w-full border px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center space-x-2 ${
                bookingState === 'booked' 
                  ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600' 
                  : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
              }`}
            >
              {bookingState === 'idle' && (
                <>
                  <span>Book Appointment</span>
                  <ExternalLink className="w-4 h-4" />
                </>
              )}
              {bookingState === 'booking' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking Slots...</span>
                </>
              )}
              {bookingState === 'booked' && (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>View Appointment</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Article Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#002147]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-5xl w-full h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="flex justify-between items-start mb-6 shrink-0">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-md mb-3 inline-block">
                  {selectedArticle.category}
                </span>
                <h3 className="text-2xl font-black text-[#002147]">{selectedArticle.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedArticle(null)}
                className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 relative">
              <iframe 
                src={selectedArticle.iframeUrl} 
                className="w-full h-full border-0 absolute inset-0"
                title="Article content"
              />
            </div>
            
            <div className="mt-6 shrink-0 flex justify-end">
              <button 
                onClick={() => setSelectedArticle(null)}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Mark as Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Details Modal */}
      {showBookingDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#002147]/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto my-auto">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 mx-auto shrink-0">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <h3 className="text-2xl font-black text-[#002147] text-center mb-2">Appointment Confirmed</h3>
            <p className="text-gray-500 text-center mb-8">Your session with the school counselor has been successfully scheduled.</p>
            
            <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <div className="flex items-start space-x-3">
                <User className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Counselor</p>
                  <p className="font-semibold text-[#002147]">Ms. Sarah Jenkins</p>
                  <p className="text-sm text-gray-500">Sr. Student Success Specialist</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Calendar className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Date & Time</p>
                  <p className="font-semibold text-[#002147]">This Saturday, Oct 28</p>
                  <p className="text-sm text-gray-500">10:30 AM - 10:45 AM (IST)</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Location</p>
                  <p className="font-semibold text-[#002147]">Google Meet (Virtual)</p>
                  <a href="#" className="text-sm text-indigo-600 hover:underline">meet.google.com/abc-defg-hij</a>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center space-x-2 text-sm text-gray-500 bg-blue-50 p-3 rounded-xl border border-blue-100">
              <Mail className="w-4 h-4 text-blue-500 shrink-0" />
              <p>A calendar invite has been sent to <strong>{profile?.email || 'your email'}</strong>.</p>
            </div>
            
            <div className="mt-8 shrink-0">
              <button 
                onClick={() => setShowBookingDetails(false)}
                className="w-full bg-[#002147] text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-900 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
