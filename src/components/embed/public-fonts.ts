// The public pages' font choices (src/lib/public-appearance.ts), self-hosted by next/font at
// build time -- no request to Google at runtime. All are declared on the public wrapper
// (`publicFontVariables`); preload is off, so a browser downloads only the font a page uses.
import { Fira_Sans, Lato, Merriweather, Montserrat, Noto_Sans, Nunito, Open_Sans, Poppins, PT_Serif, Raleway, Roboto, Source_Sans_3, Ubuntu } from "next/font/google";

const subsets: ("latin" | "latin-ext")[] = ["latin", "latin-ext"];
const common = { subsets, display: "swap" as const, preload: false };

const openSans = Open_Sans({ ...common, weight: ["400", "600"], variable: "--pf-open-sans" });
const roboto = Roboto({ ...common, weight: ["400", "500", "700"], variable: "--pf-roboto" });
const lato = Lato({ ...common, weight: ["400", "700"], variable: "--pf-lato" });
const montserrat = Montserrat({ ...common, weight: ["400", "600"], variable: "--pf-montserrat" });
const sourceSans3 = Source_Sans_3({ ...common, weight: ["400", "600"], variable: "--pf-source-sans-3" });
const notoSans = Noto_Sans({ ...common, weight: ["400", "600"], variable: "--pf-noto-sans" });
const nunito = Nunito({ ...common, weight: ["400", "600"], variable: "--pf-nunito" });
const poppins = Poppins({ ...common, weight: ["400", "600"], variable: "--pf-poppins" });
const raleway = Raleway({ ...common, weight: ["400", "600"], variable: "--pf-raleway" });
const ubuntu = Ubuntu({ ...common, weight: ["400", "500", "700"], variable: "--pf-ubuntu" });
const merriweather = Merriweather({ ...common, weight: ["400", "700"], variable: "--pf-merriweather" });
const ptSerif = PT_Serif({ ...common, weight: ["400", "700"], variable: "--pf-pt-serif" });
const firaSans = Fira_Sans({ ...common, weight: ["400", "600"], variable: "--pf-fira-sans" });

export const publicFontVariables = [openSans, roboto, lato, montserrat, sourceSans3, notoSans, nunito, poppins, raleway, ubuntu, merriweather, ptSerif, firaSans]
  .map((f) => f.variable)
  .join(" ");
