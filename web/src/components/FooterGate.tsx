"use client";

import { usePathname } from "next/navigation";
import { showsFooter } from "@/lib/bareView";

/** Shows the (server-rendered) footer only on the pages that have one (lib/bareView.ts). */
export default function FooterGate({ children }: { children: React.ReactNode }) {
  return showsFooter(usePathname()) ? children : null;
}
