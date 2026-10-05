"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Headphones } from "lucide-react";
import { uploadCover } from "@/lib/client/coverImage";

/** The square picture at the top of a remix page; its owner can change or remove it. */
export default function RemixCover({ remixId, src, title, editable }: { remixId: string; src: string | null; title: string; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? src;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    const local = URL.createObjectURL(file);
    setPreview(local);
    const problem = await uploadCover(remixId, file);
    setBusy(false);
    if (problem) {
      setError(problem);
      setPreview(null);
    } else router.refresh();
    URL.revokeObjectURL(local);
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/remixes/${remixId}/cover`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setPreview(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="group relative aspect-square w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-vocals-dim to-beat-dim shadow-lg sm:w-36"
        onDragOver={(e) => editable && e.preventDefault()}
        onDrop={(e) => {
          if (!editable) return;
          e.preventDefault();
          void pick(e.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own storage route, already sized
          <img src={shown} alt={`Cover of ${title}`} className={`h-full w-full object-cover ${busy ? "opacity-60" : ""}`} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl text-muted" aria-hidden>
            <Headphones />
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/0 to-black/0 pb-2 text-[11px] font-semibold text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            {busy ? (
              "Uploading…"
            ) : (
              <span>
                <Camera /> {shown ? "Change cover" : "Add a cover"}
              </span>
            )}
          </button>
        )}
      </div>
      {editable && src && !busy && (
        <button onClick={remove} className="self-start text-[11px] text-muted hover:text-danger">
          Remove cover
        </button>
      )}
      {error && <p className="max-w-36 text-[11px] text-danger">{error}</p>}
      {editable && <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />}
    </div>
  );
}
