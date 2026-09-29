import { useId } from "react";
import { MARK_BARS, MARK_BAR_WIDTH, MARK_GRADIENT, MARK_TILE_RADIUS, barFill, type MarkVariant } from "@/lib/brand";

/** The Remixt mark, inline so it's sharp at any size and needs no request. */
export default function RemixtMark({
  variant = "tile",
  className = "h-8 w-8",
  title,
}: {
  variant?: MarkVariant;
  className?: string;
  /** Leave unset when the mark sits next to the word "Remixt" (it's then decorative). */
  title?: string;
}) {
  // Gradient ids must be unique per page, and the mark appears more than once.
  const id = useId().replace(/:/g, "");
  const [from, via, to] = MARK_GRADIENT;
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset=".55" stopColor={via} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {variant !== "bars" && (
        <rect width="512" height="512" rx={variant === "tile" ? MARK_TILE_RADIUS : 0} fill={`url(#${id}t)`} />
      )}
      {MARK_BARS.map(([x, y, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={MARK_BAR_WIDTH}
          height={h}
          rx={18}
          fill={variant === "bars" ? barFill(i, `url(#${id}w)`) : "#fff"}
        />
      ))}
    </svg>
  );
}
