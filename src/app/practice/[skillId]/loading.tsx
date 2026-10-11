import { QuestionSkeleton } from "@/components/loading-skeletons";

/** Instant feedback while the practice question is prepared on the server (Update 42B). */
export default function Loading() {
  return <QuestionSkeleton label="Loading your practice…" />;
}
