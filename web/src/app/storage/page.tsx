import StorageSettings from "@/components/StorageSettings";

export const metadata = { title: "Saved on this device", robots: { index: false } };

export default function StoragePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Saved on this device</h1>
      <p className="mt-2 text-sm text-muted">
        Remixt keeps songs, what it worked out about them and its AI models in your browser, so they don&apos;t download
        or get worked out again. Clearing any of it is safe — your remixes, drafts and account live elsewhere — it just
        comes back the next time it&apos;s needed.
      </p>
      <StorageSettings />
    </div>
  );
}
