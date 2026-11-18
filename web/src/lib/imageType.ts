/** JPEG or PNG, told by the file's first bytes rather than what the browser claims. */
export function imageExtension(bytes: Uint8Array): ".jpg" | ".png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return ".png";
  return null;
}
