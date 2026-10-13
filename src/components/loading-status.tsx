"use client";
import { useT } from "@/i18n/client";

/** The screen-reader "Loading…" line of a loading skeleton, in the interface language. */
export function LoadingStatus({ label }: { label: string }) {
  const t = useT();
  return <p role="status" className="sr-only">{t(label)}</p>;
}
