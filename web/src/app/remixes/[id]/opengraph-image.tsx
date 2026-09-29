import { ImageResponse } from "next/og";
import { getRemixCard } from "@/lib/models";
import { markDataUri } from "@/lib/brand";

// The picture a shared remix link shows in WhatsApp, Telegram, X, iMessage…

export const alt = "A remix on Remixt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const remix = await getRemixCard(id).catch(() => undefined);
  // Private remixes get the plain card — their details aren't public.
  const card = remix?.published ? remix : undefined;
  const bars = Array.from({ length: 48 }, (_, i) => 30 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 70);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          color: "white",
          background: "linear-gradient(135deg, #1a0b2e 0%, #3b0764 45%, #0c4a6e 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
          <img src={markDataUri("tile")} width={56} height={56} alt="" />
          Remixt
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: `${h}%`,
                borderRadius: 7,
                background: i % 2 ? "rgba(236,72,153,0.85)" : "rgba(34,211,238,0.85)",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 1072 }}>
            {card ? card.title.slice(0, 60) : "Remix vocals and beats from any song"}
          </div>
          <div style={{ fontSize: 32, opacity: 0.85 }}>
            {card ? `Remix by ${card.artist_name}` : "Split a song, mix it with another, share it"}
          </div>
          {card && (
            <div style={{ display: "flex", gap: 32, fontSize: 26, opacity: 0.75 }}>
              {card.source_titles.length > 0 && <span>{card.source_titles.slice(0, 3).join(" + ").slice(0, 70)}</span>}
              <span>{card.plays} plays</span>
              <span>{card.likes} likes</span>
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
}
