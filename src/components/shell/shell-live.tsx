"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SideNav } from "../ui/side-nav";
import type { NavItem } from "../ui/main-nav";
import type { NavCount } from "@/server/teacher/week-plan";

/**
 * ⚡ The persistent page frame (Update r67). Inside /admin, /teacher, /student and /parent the frame (menu, top bar) is
 * drawn ONCE by the section's layout and kept while the person moves from page to page: no menu that disappears and
 * comes back, no frame sent again with every page, the "Loading…" skeleton shows inside the frame.
 *
 * What changes with each page (the menu numbers, the bell, the student's coins chip) still comes fresh with each page:
 * the page sends it in <ShellLive> and the frame's slots show it. Before the first page sends anything (and on the
 * server) the slots show what the layout drew.
 */
interface Live { counts: Record<string, NavCount> | null; bell: React.ReactNode | undefined; chip: React.ReactNode | undefined }
let live: Live = { counts: null, bell: undefined, chip: undefined };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const SERVER: Live = { counts: null, bell: undefined, chip: undefined };
/** The latest page's values (the layout's own drawing on the server and until the first page sends its values). */
function useLive(): Live {
  const [v, setV] = useState<Live>(SERVER);
  useEffect(() => { const f = () => setV(live); f(); return subscribe(f); }, []);
  return v;
}

/** Sent by each page inside the frame: this page's menu numbers, bell and coins chip. Draws nothing itself. */
export function ShellLive({ counts, bell, chip }: { counts: Record<string, NavCount> | null; bell?: React.ReactNode; chip?: React.ReactNode }) {
  useEffect(() => {
    live = { counts, bell, chip };
    for (const fn of listeners) fn();
  }, [counts, bell, chip]);
  return null;
}

/** A part of the frame that each page refreshes (the bell, the coins chip); the layout's own drawing until then. */
export function LiveSlot({ name, children }: { name: "bell" | "chip"; children: React.ReactNode }) {
  const v = useLive();
  return <>{v[name] !== undefined ? v[name] : children}</>;
}

/** The side menu with the latest page's numbers (the layout's numbers until a page sends its own). */
export function LiveSideNav({ items, counts, ...rest }: { items: NavItem[]; counts: Record<string, NavCount>; brand: React.ReactNode; footer?: React.ReactNode; tools?: React.ReactNode; extras?: React.ReactNode; variant?: "default" | "calm" }) {
  const v = useLive();
  const now = v.counts ?? counts;
  const withCounts = items.map(({ count: _c, alert: _a, ...i }) => ({ ...i, ...(now[i.href] ?? {}) }));
  return <SideNav items={withCounts} {...rest} />;
}

/**
 * The frame around the page. `bare` = pages of the section drawn without the frame (a print page, the locked
 * full-screen writing page): their address is matched here, as the layout is not drawn again between pages.
 */
export function ShellChrome({ bare, rail, className, top, header, mainClassName, banner, end, children }: {
  bare: string[]; rail: boolean; className: string; top: React.ReactNode; header: React.ReactNode; mainClassName: string; banner?: React.ReactNode; end?: React.ReactNode; children: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  if (bare.some((re) => new RegExp(re).test(path))) return <>{children}</>;
  return (
    <div className={className}>
      {top}
      <div className={rail ? "lg:ps-64" : ""}>
        {header}
        <main id="main" tabIndex={-1} className={mainClassName}>
          {banner}
          {children}
        </main>
      </div>
      {end}
    </div>
  );
}
