// The site's sections, shared by the top nav (tablets and up) and the tab
// bar (phones), so the two can't drift apart.

import {
  AudioLines,
  Disc3,
  Flag,
  FlaskConical,
  HardDrive,
  House,
  Library,
  LogOut,
  Menu,
  MessageSquareHeart,
  Radio,
  RadioTower,
  Shield,
  SlidersVertical,
  Trophy,
  Wallet,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavIconName =
  | "home"
  | "library"
  | "studio"
  | "remixes"
  | "live"
  | "radio"
  | "dj"
  | "examples"
  | "challenges"
  | "top"
  | "upload"
  | "more"
  | "admin"
  | "profile"
  | "storage"
  | "earnings"
  | "feedback"
  | "logout";

export type NavLink = {
  href: string;
  label: string;
  icon: NavIconName;
  /** In the header, shown from laptop width up; tablets find it under "More". */
  wideOnly?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/library", label: "Library", icon: "library" },
  { href: "/studio", label: "Studio", icon: "studio" },
  { href: "/remixes", label: "Remixes", icon: "remixes" },
  { href: "/live", label: "Live", icon: "live" },
  { href: "/radio", label: "Radio", icon: "radio" },
  { href: "/dj", label: "DJ", icon: "dj", wideOnly: true },
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/examples", label: "Examples", icon: "examples", wideOnly: true },
  { href: "/challenges", label: "Challenges", icon: "challenges", wideOnly: true },
  { href: "/leaderboard", label: "Top", icon: "top", wideOnly: true },
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
  { href: "/live", label: "Live sessions", icon: "live" },
  { href: "/radio", label: "Radio", icon: "radio" },
  { href: "/dj", label: "DJ decks", icon: "dj" },
  { href: "/examples", label: "Splitting & matching examples", icon: "examples" },
  { href: "/challenges", label: "Challenges", icon: "challenges" },
  { href: "/leaderboard", label: "Top artists & remixes", icon: "top" },
  { href: "/earnings", label: "Earnings", icon: "earnings" },
  { href: "/storage", label: "Saved on this device", icon: "storage" },
  { href: "#feedback", label: "Send feedback", icon: "feedback" },
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
  live: Radio,
  radio: RadioTower,
  dj: Disc3,
  examples: FlaskConical,
  challenges: Flag,
  top: Trophy,
  upload: Upload,
  more: Menu,
  admin: Shield,
  profile: UserRound,
  storage: HardDrive,
  earnings: Wallet,
  logout: LogOut,
  feedback: MessageSquareHeart,
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} />;
}
