const IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i;

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * Opens a picture for drawing. An <img> comes first: it's what reads an
 * iPhone's HEIC photos, turns photos the right way up (EXIF orientation),
 * and copes with 24–48 MP camera photos without running a phone out of
 * memory — createImageBitmap fails on all three in Safari. The bitmap is
 * the fallback for anything an <img> won't take.
 */
async function decode(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    }
  } catch {
    // not something an <img> can show — try the bitmap below
  }
  URL.revokeObjectURL(url);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error(
      /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type)
        ? "This browser can't open HEIC photos — pick it on your iPhone, or save it as a JPEG first"
        : "This picture can't be opened here — try a JPEG or PNG"
    );
  });
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

/**
 * Turns any picture the person picks into a square cover: centre-cropped,
 * at most 1000px, as a JPEG. That keeps uploads small (a full-size phone
 * photo would be far over the limit), drops the photo's location data
 * (EXIF) and gives every card the same shape.
 */
export async function squareCover(file: File, size = 1000): Promise<Blob> {
  // Some phones and file pickers leave the type empty (HEIC especially).
  if (!file.type.startsWith("image/") && !(file.type === "" && IMAGE_NAME.test(file.name))) {
    throw new Error("Pick a picture (JPEG, PNG, WebP or HEIC)");
  }
  const image = await decode(file);
  try {
    const side = Math.min(image.width, image.height);
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    canvas.width = canvas.height = 0; // hands the memory back straight away on iOS
    if (!blob) throw new Error("Couldn't prepare the picture");
    return blob;
  } finally {
    image.release();
  }
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
