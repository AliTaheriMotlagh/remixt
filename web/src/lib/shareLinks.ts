/** A remix's short link path (see app/r/[code]). */
export function shortPath(remixId: string) {
  return `/r/${remixId.slice(0, 8)}`;
}

/** The HTML to paste into a blog or bio page to embed a remix's player. */
export function embedCode(origin: string, remixId: string, title: string) {
  const safeTitle = title.replace(/[<>"&]/g, "");
  return `<iframe src="${origin}/embed/${remixId}" title="${safeTitle} on Remixt" width="100%" height="152" style="border:0;border-radius:12px" allow="autoplay" loading="lazy"></iframe>`;
}
