"use client";

// The owner's settings (Admin → Settings) for components in the browser:
// the root layout reads them on the server and hands down the public part
// (limits and security stay on the server). Before anything's set, or in
// a component rendered outside the layout, they're the defaults.

import { createContext, useContext } from "react";
import { DEFAULTS, publicSettings, type PublicSettings } from "@/lib/settings/registry";

const SettingsContext = createContext<PublicSettings>(publicSettings(DEFAULTS));

export function SettingsProvider({ value, children }: { value: PublicSettings; children: React.ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** The settings in force, in a client component. */
export function useSettings(): PublicSettings {
  return useContext(SettingsContext);
}
