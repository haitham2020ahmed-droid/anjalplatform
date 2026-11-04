"use client";
import { MapError } from "@/components/map/map-error";

/** 🧯 r79: the MAP center's own error page (EN + AR, Try again + Back to MAP) — never a white page. */
export default function MapCenterError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <MapError {...props} />;
}
