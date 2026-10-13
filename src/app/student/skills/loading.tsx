import { SectionSkeleton } from "@/components/loading-skeletons";

/** Instant feedback while this page is prepared on the server (shaped like the page that is coming). */
export default function Loading() {
  return <SectionSkeleton label="Loading your skills…" />;
}
