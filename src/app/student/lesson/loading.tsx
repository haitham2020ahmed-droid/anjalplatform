import { QuestionSkeleton } from "@/components/loading-skeletons";

/** Instant feedback while the lesson is prepared on the server (Update 42B). */
export default function Loading() {
  return <QuestionSkeleton label="Loading your lesson…" />;
}
