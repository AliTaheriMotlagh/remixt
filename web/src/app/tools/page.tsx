import ToolsHub, { toolsHubMetadata } from "@/components/tools/ToolsHub";

export const metadata = toolsHubMetadata("en");

export default function ToolsPage() {
  return <ToolsHub locale="en" />;
}
