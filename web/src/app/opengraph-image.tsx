import RemixImage from "./remixes/[id]/opengraph-image";

// Every other page shares the generic Remixt card (the remix one, with no remix).
export const alt = "Remixt — remix vocals and beats from any song";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return RemixImage({ params: Promise.resolve({ id: "" }) });
}
