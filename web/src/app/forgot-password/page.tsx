import { pageMetadata } from "@/lib/seo";
import ForgotForm from "./ForgotForm";

export const metadata = pageMetadata({ title: "Forgot your password", description: "Get a link to choose a new Remixt password.", path: "/forgot-password", noindex: true });

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
