import { getStemsByKindWithArtist } from "@/lib/models";
import LibraryBrowser from "@/components/LibraryBrowser";

export default async function LibraryPage() {
  const [vocals, beats] = await Promise.all([
    getStemsByKindWithArtist("vocals"),
    getStemsByKindWithArtist("beat"),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold">Library</h1>
      <p className="mt-1 text-sm text-muted">
        Every vocal and beat stem split from an uploaded song. Preview
        anything, then send it to the studio to start remixing.
      </p>
      <LibraryBrowser initialVocals={vocals} initialBeats={beats} />
    </div>
  );
}
