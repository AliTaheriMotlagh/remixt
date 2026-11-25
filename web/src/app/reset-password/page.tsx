import { pageMetadata } from "@/lib/seo";
import ResetForm from "./ResetForm";

export const metadata = pageMetadata({ title: "Choose a new password", description: "Set a new Remixt password.", path: "/reset-password", noindex: true });

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return <ResetForm token={typeof token === "string" ? token : ""} />;
}
