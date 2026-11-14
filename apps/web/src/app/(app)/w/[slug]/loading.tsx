import { PageSkeleton } from "@/features/dashboard/skeletons";

// Each page has its own loading state so that navigating between pages shows
// a placeholder immediately while the page's data is fetched.
export default function Loading() {
  return <PageSkeleton />;
}
