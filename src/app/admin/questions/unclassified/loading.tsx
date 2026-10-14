import { SectionSkeleton } from "@/components/loading-skeletons";

/** Instant feedback after “Sort them” while the page of questions to classify is prepared. */
export default function Loading() {
  return <SectionSkeleton label="Loading the questions to classify…" cards={2} />;
}
