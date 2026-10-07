/** Where skills/standards are chosen: the reference everything is aligned to. */
export function CcssNote({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900 ring-1 ring-indigo-200 ${className}`}>
      <span aria-hidden="true" className="text-base leading-none">🌐</span>
      <span><b>CCSS</b> (Common Core State Standards) is the international reference used by <b>StudySync</b> and <b>Wonders</b>. Every skill and question here is aligned to a CCSS standard (e.g. RI.6.2).</span>
    </p>
  );
}
