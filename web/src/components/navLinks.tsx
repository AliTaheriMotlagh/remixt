// The site's sections, shared by the top nav (tablets and up) and the tab
// bar (phones), so the two can't drift apart.

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

const PATHS: Record<NavIconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  library: (
    <>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </>
  ),
  studio: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </>
  ),
  remixes: <path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3" />,
  challenges: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  top: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
      <path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0z" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5M12 3v12" />
    </>
  ),
  more: <path d="M4 6h16M4 12h16M4 18h16" />,
  admin: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
