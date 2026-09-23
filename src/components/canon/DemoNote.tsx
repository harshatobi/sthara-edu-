/** Shown on canon pages when they're rendering the dev-only demo dataset (no live session). */
export default function DemoNote() {
  return (
    <div className="note info no-print" style={{ marginBottom: 18 }} role="status">
      <b>Demo records.</b> There&apos;s no live school session, so this desk shows the sample 10A student. Sign in with a school
      account to see real assignments, grades and TML.
    </div>
  );
}
