/**
 * 🎙 The Fluency Coach icon: a microphone in a speech bubble, sound waves, and an AI check mark.
 * Rounded, friendly, two brand-bright colours; no text; reads well from 20 px to 96 px.
 */
export function FluencyCoachIcon({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Fluency Coach">
      <defs>
        <linearGradient id="fc-bubble" x1="8" y1="6" x2="52" y2="54" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#14b8a6" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
        <linearGradient id="fc-check" x1="40" y1="38" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#f97316" /></linearGradient>
      </defs>
      {/* speech bubble */}
      <path d="M14 6h30a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H27l-9 8v-8h-4A10 10 0 0 1 4 36V16A10 10 0 0 1 14 6Z" fill="url(#fc-bubble)" />
      {/* sound waves */}
      <path d="M12.5 21.5a8 8 0 0 0 0 9" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M45.5 21.5a8 8 0 0 1 0 9" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.5 18a13 13 0 0 0 0 16" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M49.5 18a13 13 0 0 1 0 16" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
      {/* microphone */}
      <rect x="24" y="12" width="10" height="17" rx="5" fill="#fff" />
      <path d="M20 25a9 9 0 0 0 18 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M29 34v4" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      {/* AI check */}
      <circle cx="50" cy="49" r="11" fill="url(#fc-check)" stroke="#fff" strokeWidth="2.5" />
      <path d="m45 49 3.5 3.5L55.5 45" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58.5 37.5l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="#fbbf24" />
    </svg>
  );
}
