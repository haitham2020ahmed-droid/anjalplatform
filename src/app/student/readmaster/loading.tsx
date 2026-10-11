import { ReadingListSkeleton } from "@/components/loading-skeletons";

/** Instant feedback while the ReadMaster articles are prepared on the server (Update 42B). */
export default function Loading() {
  return <ReadingListSkeleton label="Loading ReadMaster…" />;
}
