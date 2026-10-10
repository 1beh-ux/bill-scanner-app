"use client";

import { createContext, useContext } from "react";

// Which level the template editors work on (organizations step 4): the organization's
// templates (Organizace -> Šablony) or the app's (Aplikace -> Šablony aplikace).
// The editors stay the same; their API calls get ?level=app (src/lib/template-scope.ts).
export type TemplateLevel = "org" | "app";
const LevelContext = createContext<TemplateLevel>("org");
export const TemplateLevelProvider = LevelContext.Provider;
export const useTemplateLevel = () => useContext(LevelContext);

/** Adds level=app to a template API URL on the app level. */
export function useLevelUrl() {
  const level = useTemplateLevel();
  return (url: string) => (level === "app" ? `${url}${url.includes("?") ? "&" : "?"}level=app` : url);
}
