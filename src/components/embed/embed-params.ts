// Server-side (the public pages): ?embed=1 / ?theme= -> PublicFrame props. Not a client module.
/** ?embed=1 / ?theme= from a page's searchParams. */
export function embedParams(sp: Record<string, string | string[] | undefined>): { embed: boolean; theme: "light" | "dark" | null } {
  const theme = sp.theme === "light" || sp.theme === "dark" ? sp.theme : null;
  return { embed: sp.embed === "1", theme };
}
