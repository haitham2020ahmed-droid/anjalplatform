"use client";
/**
 * 🛟 r68: an error inside a player (practice, a question set, NAFS practice) is caught HERE, inside the page, and the
 * player recovers in place — never the full-page "Something went wrong · Try again · Home". The error goes to the school's
 * error log (Admin → Errors) with the page; "Try again" draws the player again from the server (the student's place and
 * every saved answer are kept there).
 */
import React from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

function Fallback({ onReset }: { onReset: () => void }) {
  const t = useT();
  const router = useRouter();
  return (
    <div role="alert" data-testid="player-recover" className="mx-auto mt-6 max-w-xl rounded-2xl bg-amber-50 p-5 text-center ring-1 ring-amber-200">
      <p className="text-lg font-semibold text-amber-900">{t("This part of the page did not load. Your answers are saved.")}</p>
      <button type="button" onClick={() => { onReset(); router.refresh(); }} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white hover:bg-brand-purple">{t("Try again")}</button>
    </div>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode; where?: string }, { failed: boolean; round: number }> {
  override state = { failed: false, round: 0 };
  static getDerivedStateFromError(): Partial<{ failed: boolean }> { return { failed: true }; }
  override componentDidCatch(error: Error): void {
    try {
      void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `[player${this.props.where ? ` ${this.props.where}` : ""}] ${String(error?.message ?? error).slice(0, 400)}`, path: window.location.pathname }) }).catch(() => undefined);
    } catch { /* offline */ }
  }
  override render(): React.ReactNode {
    if (this.state.failed) return <Fallback onReset={() => this.setState((s) => ({ failed: false, round: s.round + 1 }))} />;
    return <React.Fragment key={this.state.round}>{this.props.children}</React.Fragment>;
  }
}

/** The boundary as a function component (the class is created with createElement: the page's JSX stays typed). */
export function PlayerBoundary({ children, where }: { children: React.ReactNode; where?: string }) {
  const B = Boundary as unknown as (props: { where?: string; children?: React.ReactNode }) => React.ReactNode;
  return <B where={where}>{children}</B>;
}
