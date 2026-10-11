// Test stand-in for next/font/google (only Next's compiler implements it): every font is
// an empty class / variable, so public pages render in scripts/test-org-isolation.ts.
const font = (_options?: unknown) => ({ className: "", variable: "", style: { fontFamily: "" } });
export const IBM_Plex_Sans = font, IBM_Plex_Mono = font, Open_Sans = font, Roboto = font, Lato = font, Montserrat = font, Source_Sans_3 = font, Noto_Sans = font;
export const Nunito = font, Poppins = font, Raleway = font, Ubuntu = font, Merriweather = font, PT_Serif = font, Fira_Sans = font;
