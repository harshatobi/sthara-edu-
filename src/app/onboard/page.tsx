import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, School } from 'lucide-react';

export const metadata: Metadata = { title: 'Bring Sthara to your school' };

/**
 * There is no self-serve sign-up: Sthara sets every school up with its people and creates every login (each can use
 * the AI features, which Sthara pays for). This page sends schools to the enquiry form, which lands in the
 * Platform Manager's Enquiries, where an operator creates the school.
 */
export default function OnboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-10 text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-blue-100">
          <School className="w-10 h-10 text-[#002147]" />
        </div>
        <h1 className="text-3xl font-black text-[#002147] mb-2">We set Sthara up with you</h1>
        <p className="text-gray-500 font-medium mb-8">
          Every school is onboarded personally: your classes, your staff and your students&apos; logins are created by the Sthara team.
          Tell us about your school and we will be in touch.
        </p>
        <a href="/contact" className="block w-full py-4 bg-[#002147] text-white rounded-2xl font-bold text-lg hover:bg-[#003580] transition-colors">
          Contact the Sthara team <ArrowRight className="w-5 h-5 inline -mt-0.5 ml-1" />
        </a>
        <Link href="/login" className="block text-sm text-gray-500 font-semibold mt-5 hover:text-[#002147]">Already have a school code? Sign in</Link>
      </div>
    </div>
  );
}
