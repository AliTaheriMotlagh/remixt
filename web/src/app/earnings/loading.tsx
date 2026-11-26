import PageSkeleton from "@/components/PageSkeleton";

// A link here answers at once with the page's shape, rather than the old page
// sitting there until the server has rendered this one (on a slow line, 8 s
// and more: "stuck" in Admin → Feedback & problems). Only on routes that
// never answer 404: under a loading boundary a missing page can't say so.
export default function Loading() {
  return <PageSkeleton shape="rows" />;
}
