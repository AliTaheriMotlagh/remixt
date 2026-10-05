/**
 * Turns any picture the person picks into a square cover: centre-cropped,
 * at most 1000px, as a JPEG. That keeps uploads small, drops the photo's
 * location data (EXIF) and gives every card the same shape.
 */
export async function squareCover(file: File, size = 1000): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a picture (JPEG, PNG, WebP or HEIC)");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This picture can't be opened here — try a JPEG or PNG");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Couldn't prepare the picture");
  return blob;
}

/** Uploads a cover for a remix; returns the error to show, or null. */
export async function uploadCover(remixId: string, file: File): Promise<string | null> {
  try {
    const blob = await squareCover(file);
    const res = await fetch(`/api/remixes/${remixId}/cover`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? "Couldn't upload the cover";
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't upload the cover";
  }
}
