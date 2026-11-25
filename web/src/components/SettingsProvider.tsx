"use client";

// The owner's settings (Admin → Settings) for components in the browser:
// the root layout reads them on the server and hands down the public part
// (limits and security stay on the server). Before anything's set, or in
// a component rendered outside the layout, they're the defaults.

import { createContext, useContext } from "react";
import { DEFAULTS, publicSettings, type PublicSettings } from "@/lib/settings/registry";
import type { Plan } from "@/lib/plans";

const SettingsContext = createContext<PublicSettings>(publicSettings(DEFAULTS));
const PlanContext = createContext<Plan>("free");

export function SettingsProvider({ value, plan = "free", children }: { value: PublicSettings; plan?: Plan; children: React.ReactNode }) {
  return (
    <SettingsContext.Provider value={value}>
      <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>
    </SettingsContext.Provider>
  );
}

/** The signed-in member's plan (signed out: Free). */
export function usePlan(): Plan {
  return useContext(PlanContext);
}

/** Whether this visitor sees ads (Plus members don't, when the owner says so). */
export function useShowsAds(): boolean {
  const { plans } = useSettings();
  const plan = usePlan();
  return !(plans.enabled && plans.plusNoAds && plan === "plus");
}

/** The settings in force, in a client component. */
export function useSettings(): PublicSettings {
  return useContext(SettingsContext);
}
