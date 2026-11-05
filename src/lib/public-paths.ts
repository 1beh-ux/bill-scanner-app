// Pages parents and the public see (no app navigation, no admin chrome). R4-5 (audit2): one list for every
// piece of app chrome -- the sidebar and the super-admin's "acting in organization" strip.
const PUBLIC_PREFIXES = ["/login", "/p/", "/r/", "/u/", "/vstup/", "/vyuctovani/"];
export const isPublicPath = (pathname: string) => PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
