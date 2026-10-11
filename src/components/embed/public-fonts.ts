// The public pages' font choices (src/lib/public-appearance.ts), self-hosted by next/font at
// build time -- no request to Google at runtime. All are declared on the public wrapper
// (`publicFontVariables`); preload is off, so a browser downloads only the font a page uses.
import { Fira_Sans, Lato, Merriweather, Montserrat, Noto_Sans, Nunito, Open_Sans, Poppins, PT_Serif, Raleway, Roboto, Source_Sans_3, Ubuntu } from "next/font/google";

// next/font needs literal options in every call (no shared object / spread).
const openSans = Open_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-open-sans" });
const roboto = Roboto({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--pf-roboto" });
const lato = Lato({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "700"], variable: "--pf-lato" });
const montserrat = Montserrat({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-montserrat" });
const sourceSans3 = Source_Sans_3({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-source-sans-3" });
const notoSans = Noto_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-noto-sans" });
const nunito = Nunito({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-nunito" });
const poppins = Poppins({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-poppins" });
const raleway = Raleway({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-raleway" });
const ubuntu = Ubuntu({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--pf-ubuntu" });
const merriweather = Merriweather({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "700"], variable: "--pf-merriweather" });
const ptSerif = PT_Serif({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "700"], variable: "--pf-pt-serif" });
const firaSans = Fira_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: ["400", "600"], variable: "--pf-fira-sans" });

export const publicFontVariables = [openSans, roboto, lato, montserrat, sourceSans3, notoSans, nunito, poppins, raleway, ubuntu, merriweather, ptSerif, firaSans]
  .map((f) => f.variable)
  .join(" ");
