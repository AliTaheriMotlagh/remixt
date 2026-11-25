import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { confirmEmail } from "@/lib/emailTokens";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Confirm your email", description: "Confirm your email address for Remixt.", path: "/verify-email", noindex: true });

// The link from the confirm-your-email message.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const ok = typeof token === "string" && !!(await confirmEmail(token).catch(() => null));
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {ok ? <CheckCircle2 className="h-12 w-12 text-success" /> : <XCircle className="h-12 w-12 text-danger" />}
      <h1 className="text-2xl font-bold">{ok ? "Your email is confirmed" : "This link doesn't work any more"}</h1>
      <p className="text-sm text-muted">
        {ok
          ? "Thanks! You can publish remixes, get paid and join Plus."
          : "It was used already, or it ran out (links last 3 days). Sign in and ask for a new one from the banner at the top."}
      </p>
      <Link href={ok ? "/studio" : "/login"} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">
        {ok ? "Open the Studio" : "Log in"}
      </Link>
    </div>
  );
}
