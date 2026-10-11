/**
 * 🚀 The ReadRise mark (original artwork): an open book whose pages lift into a rising arrow.
 * Decorative by default (aria-hidden); pass `title` to make it a labelled image.
 */
export function ReadRiseIcon({ size = 40, title, className = "" }: { size?: number; title?: string; className?: string }) {
  const labelled = Boolean(title);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role={labelled ? "img" : undefined} aria-hidden={labelled ? undefined : true} aria-label={title} focusable="false">
      {title && <title>{title}</title>}
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#1f3a68" />
      {/* the open book */}
      <path d="M8 31.5c5-2.2 10-2.2 15 .6V38c-5-2.6-10-2.6-15-.4z" fill="#ffffff" />
      <path d="M40 31.5c-5-2.2-10-2.2-15 .6V38c5-2.6 10-2.6 15-.4z" fill="#d9f2f2" />
      <path d="M24 32.1V38" stroke="#1f3a68" strokeWidth="1.2" />
      {/* the rising arrow, growing out of the spine */}
      <path d="M12 27.5l7.5-6.5 5 4 9.5-11" fill="none" stroke="#f5b800" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28.6 12.6l6.6-1.2-.9 6.7z" fill="#f5b800" />
      <circle cx="19.5" cy="21" r="1.7" fill="#1fa3a3" />
    </svg>
  );
}
