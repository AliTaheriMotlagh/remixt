// The site's sections, shared by the top nav (tablets and up) and the tab
// bar (phones), so the two can't drift apart.

import {
  AudioLines,
  Flag,
  House,
  Library,
  LogOut,
  Menu,
  Shield,
  SlidersVertical,
  Trophy,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavIconName =
  | "home"
  | "library"
  | "studio"
  | "remixes"
  | "challenges"
  | "top"
  | "upload"
  | "more"
  | "admin"
  | "profile"
  | "logout";

export type NavLink = { href: string; label: string; icon: NavIconName };

export const NAV_LINKS: NavLink[] = [
  { href: "/library", label: "Library", icon: "library" },
  { href: "/studio", label: "Studio", icon: "studio" },
  { href: "/remixes", label: "Remixes", icon: "remixes" },
  { href: "/challenges", label: "Challenges", icon: "challenges" },
  { href: "/leaderboard", label: "Top", icon: "top" },
  { href: "/upload", label: "Upload", icon: "upload" },
];

/** On phones: four tabs, and the rest behind "More". */
export const TAB_LINKS: NavLink[] = [
  { href: "/library", label: "Library", icon: "library" },
  { href: "/remixes", label: "Remixes", icon: "remixes" },
  { href: "/studio", label: "Studio", icon: "studio" },
  { href: "/upload", label: "Upload", icon: "upload" },
];

export const MORE_LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/challenges", label: "Challenges", icon: "challenges" },
  { href: "/leaderboard", label: "Top artists & remixes", icon: "top" },
];

export function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

const ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  library: Library,
  studio: SlidersVertical,
  remixes: AudioLines,
  challenges: Flag,
  top: Trophy,
  upload: Upload,
  more: Menu,
  admin: Shield,
  profile: UserRound,
  logout: LogOut,
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} />;
}
