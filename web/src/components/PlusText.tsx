import Link from "next/link";

/**
 * An error or note as it is — and, when it says the thing is part of Remixt
 * Plus (the server's answer for a Plus-only feature), a link to /plus after it.
 */
export default function PlusText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  if (!/Remixt Plus|part of Plus|Plus has more|remixt\.app\/plus/.test(text)) return <>{text}</>;
  const clean = text.replace(/\s*—\s*see remixt\.app\/plus\.?$/, "").replace(/\s*\(remixt\.app\/plus\)/, "");
  return (
    <>
      {clean}{" "}
      <Link href="/plus" className="whitespace-nowrap font-semibold text-brand-strong underline underline-offset-2">
        See Plus →
      </Link>
    </>
  );
}
