import ExamplesLab from "@/components/examples/ExamplesLab";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "See stem splitting and remix matching in action",
  description:
    "An interactive lab: hear real library songs split into vocals and beat by the AI splitter (or original demo songs), then match one song's vocal to another's beat and hear raw against matched.",
  path: "/examples",
});

export default function ExamplesPage() {
  return <ExamplesLab />;
}
