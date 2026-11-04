"use client";
import { MapError } from "@/components/map/map-error";

/** 🧯 r79: MAP scores (RIT): its own error page (EN + AR, Try again + Back to MAP) — never a white page. */
export default function MapRitError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <MapError {...props} />;
}
