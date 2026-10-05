import ExamplesLab from "@/components/examples/ExamplesLab";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "See stem splitting and remix matching in action",
  description:
    "An interactive lab: split a demo song into vocals and beat, then match one song's vocal to another's beat and hear raw against matched. All synthesised in your browser.",
  path: "/examples",
});

export default function ExamplesPage() {
  return <ExamplesLab />;
}
