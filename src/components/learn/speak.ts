import { stripMarks } from "@/lib/inline-marks";

/** 🔊 Listen: the browser reads the text aloud (en-US, rate 0.92). Nothing is recorded or stored. */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const t = stripMarks(String(text ?? "")).trim();
  if (!t) return;
  const u = new SpeechSynthesisUtterance(t);
  u.lang = "en-US";
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
