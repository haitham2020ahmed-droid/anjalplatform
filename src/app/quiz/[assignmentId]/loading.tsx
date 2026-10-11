import { QuestionSkeleton } from "@/components/loading-skeletons";

/** Instant feedback while the questions are prepared on the server (Update 42B). */
export default function Loading() {
  return <QuestionSkeleton label="Loading your questions…" />;
}
