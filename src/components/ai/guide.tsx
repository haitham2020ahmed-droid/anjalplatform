/** 📘 The short user guide shown on the AI Tools page (same text as AI_GUIDE.md). */
export function AiGuide() {
  return (
    <div className="space-y-4 text-slate-800">
      <section><h3 className="text-lg font-bold text-brand-navy">What the AI Tools Do</h3><p>They help you clean and complete the question bank. The AI only reads questions and passages — never students' names, scores, MAP data or answers. Nothing changes in the bank until you approve it.</p></section>
      <section><h3 className="text-lg font-bold text-brand-navy">🪄 Prepare a Skill (Start Here)</h3><ol className="list-decimal space-y-1 ps-6">
        <li>Open <b>Prepare a Skill</b>. Skills at the top are the most urgent (coming up soon, or where students are weakest).</li>
        <li>Click a skill and follow the 6 steps in order. Each step has <b>Start</b>, its results, and <b>Next step</b>.</li>
        <li><b>Quality Check</b>: fix the red problems first (wrong answer key, more than one correct answer). Open ✏️ Edit, correct the question, then ✓ approve to close the problem — or ✗ reject if the AI is wrong.</li>
        <li><b>Duplicate Finder</b>: ✓ approve archives the copy (the older question stays). ✗ keeps both.</li>
        <li><b>Auto-Tag</b>: look at the 10 random examples. If they look right, press <b>Approve all</b>.</li>
        <li>When the last Gap Report shows what is still missing, the skill is <b>Ready</b>.</li></ol></section>
      <section><h3 className="text-lg font-bold text-brand-navy">🗓️ Weekly Routine (10 Minutes)</h3><ol className="list-decimal space-y-1 ps-6">
        <li>Open AI Tools. If a week has passed, the check of <b>new questions</b> starts by itself (or press <b>Run now</b>).</li>
        <li>Open <b>Review</b> and approve or fix the results.</li>
        <li>Open <b>Suspicious questions</b> and check the top ones.</li></ol></section>
      <section><h3 className="text-lg font-bold text-brand-navy">🔍 Suspicious Questions</h3><p>Worked out from real student answers (no AI): questions where most students are wrong — strong students too — or where one wrong option is chosen more than the correct one. Usually the answer key or the wording is wrong. Open ✏️ Edit and check.</p></section>
      <section><h3 className="text-lg font-bold text-brand-navy">If Something Goes Wrong</h3><ul className="list-disc space-y-1 ps-6">
        <li>“Limit reached”: the free Gemini plan allows only a few requests a minute and a limited number a day. The tool waits and continues by itself — or tomorrow, from where it stopped.</li>
        <li>“Not set up” / “key not valid”: the GEMINI_API_KEY in the server settings (Render → Environment) is missing or wrong. The rest of the platform keeps working.</li>
        <li>A question marked <b>Failed</b> got no valid answer after 3 tries; the reason is shown. Run the tool again on that skill later.</li></ul></section>
    </div>
  );
}
