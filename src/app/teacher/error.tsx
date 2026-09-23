'use client';

export default function TeacherError({ unstable_retry }: { unstable_retry: () => void }) {
  return <section role="alert" className="m-6 rounded-2xl bg-white p-8 text-[#002147] shadow-sm">
    <h1 className="text-2xl font-bold">This teacher view could not load</h1>
    <p className="my-4">Please retry, or return to the teacher dashboard.</p>
    <button className="rounded-xl bg-[#002147] px-5 py-3 text-white" onClick={unstable_retry}>Try again</button>
    <a className="ml-4 underline" href="/teacher">Teacher dashboard</a>
  </section>;
}
