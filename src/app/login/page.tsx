"use client";
import { getRedirectResult, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";
import { auth, googleProvider, prefersRedirectSignIn } from "@/lib/firebase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Tent, Receipt, HeartPulse, Mail as MailIcon, Users, CalendarDays, CookingPot, Landmark, Ticket, Building2, Globe, Car } from "lucide-react";

// Each module: what it does, in the words the app uses. shot = /public/landing/<shot>.jpg
// (hidden until the file exists, list in docs/landing-screenshots.md).
const MODULES = [
  {
    icon: Receipt,
    title: "Účtenky",
    shot: "uctenky",
    body: "Foto, soubor, import z Google Disku nebo z tabulky. AI přečte obchod, datum a částku, vy rozdělíte řádky do kategorií a schválíte. Rozpočet po kategoriích, cizí měny podle kurzu ČNB, plátci a proplácení QR platbou, vyúčtování pro každého jedním odkazem, export na Disk s manifestem pro účetní, osobní účtenky mimo vyúčtování akce.",
  },
  {
    icon: Car,
    title: "Cestovní příkazy",
    shot: "cestovni-prikazy",
    body: "Cesta vlastním autem podle sazeb z vyhlášky platných k datu cesty. Úseky, auto z evidence vozidel, výpočet náhrady a PDF příkazu – z odeslaného příkazu vznikne účtenka akce.",
  },
  {
    icon: Landmark,
    title: "Banka",
    shot: "banka",
    body: "Pohyby z účtu akce (Fio API nebo Google Tabulka) porovnané s účtenkami: co je zaplaceno, k čemu chybí doklad, kolik šlo v hotovosti. Přístup jen pro výslovně určené lidi.",
  },
  {
    icon: Users,
    title: "Účastníci a přihlášky",
    shot: "ucastnici",
    body: "Veřejná přihláška akce, seznam účastníků se zákonnými zástupci, import z tabulky, vlastní pole, přijetí registrace e-mailem s dokumenty vygenerovanými ze šablon (přihláška, posudek…) a přehled, co od koho dorazilo.",
  },
  {
    icon: HeartPulse,
    title: "Zdraví",
    shot: "zdravi",
    body: "Zdravotní deník: léky a jejich výdej podle časů podání, záznamy o úrazech a nemocech s fotkou a mapou těla, souhrny pro rodiče e-mailem i jako PDF.",
  },
  {
    icon: MailIcon,
    title: "Pošta",
    shot: "posta",
    body: "Schránka akce: přílohy z došlých e-mailů se přiřadí účastníkovi jako přijatý dokument, hromadné rozeslání stavu dokumentů rodičům, přehled vyřízeného.",
  },
  {
    icon: CalendarDays,
    title: "Plánování programu",
    shot: "planovani",
    body: "Program akce po dnech: aktivity z knihovny přetáhnete do časové osy a hned vidíte, kolik času je naplánováno a kolik zbývá.",
  },
  {
    icon: CookingPot,
    title: "Kuchyně",
    shot: "kuchyne",
    body: "Jídelníček z knihovny jídel celé organizace, množství surovin podle počtu porcí, nákup, list pro kuchaře a hlídání 14 alergenů a diet dětí i dospělých na akci.",
  },
  {
    icon: Ticket,
    title: "Vstupenky",
    shot: "vstupenky",
    body: "Pro veřejné akce (ples, koncert): druhy vstupenek a limity, objednávky s vlastním variabilním symbolem a QR platbou, automatická kontrola plateb přes Fio, vstupenky s QR kódem e-mailem a odkaz pro kontrolu u vchodu.",
  },
];

const ORG = [
  {
    icon: Building2,
    title: "Organizace",
    body: "Každá organizace má svá data oddělená: akce, uživatele, Lidi (společný seznam dětí a dospělých napříč roky), šablony pro nové akce, sazby a vozidla. Moduly se zapínají po akcích a přístup se přiděluje po modulech – hlavní vedoucí vidí jen to, co potřebuje.",
  },
  {
    icon: Globe,
    title: "Zveřejnění pro rodiče",
    body: "Přihlášku a rodičovský portál zveřejníte na vlastní adrese (např. prihlasky.vasetabory.cz) nebo vložíte přímo do svého webu. Vzhled a texty veřejných stránek si organizace upraví sama; rodiče v portálu spravují rodinu a kontaktní údaje, vidí stav přihlášek, plateb a dokumentů.",
  },
];


export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Back from a redirect sign-in (Apple browsers / home-screen app): finish it here.
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => result && finishSignIn(result.user))
      .catch((err) => showError(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showError(err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    console.error(err);
    setBusy(false);
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    setError(`Přihlášení se nepodařilo (${code || "neznámá chyba"}). Zkuste to znovu, případně napište Pavlovi.`);
  }

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    // Popups can't hand the result back from a home-screen app or through
    // Safari's tracking protection -- use a full-page redirect there.
    if (prefersRedirectSignIn()) {
      await signInWithRedirect(auth, googleProvider).catch(showError);
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await finishSignIn(result.user);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, googleProvider).catch(showError);
        return;
      }
      showError(err);
    }
  }

  async function finishSignIn(user: User) {
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        // Personal landing-page preference (src/app/settings/page.tsx) --
        // falls back to "/" (which itself redirects to /events) when unset.
        const me = await fetch("/api/me")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        // A full page load, not router.push: the app-wide translations and /api/me were
        // fetched (and refused) while still logged out -- a client-side switch would keep
        // that empty state until the user refreshes (raw keys, missing menu on first login).
        window.location.assign(me?.landingPath || "/");
      } else {
        setBusy(false);
        setError("Tento účet nemá přístup do aplikace. Přístup uděluje Pavel — napište mu, ať vás přidá.");
      }
    } catch (err) {
      showError(err);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-16 sm:py-24">
        {/* Hero */}
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember">
                <Tent size={17} className="text-night" aria-hidden="true" />
              </div>
              <span className="text-[15px] font-medium">tabornik.online</span>
            </div>

            <span className="rounded-full border border-ember px-2.5 py-0.5 text-[12px] font-medium text-ember">Testovací provoz · zdarma</span>

            <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">
              Celý tábor v jedné aplikaci — od přihlášky po vyúčtování.
            </h1>

            <p className="max-w-lg text-[16px] leading-relaxed text-ink-secondary">
              Pro dobrovolnické organizace, které pořádají tábory, pobytové i veřejné akce.
              Přihlášky a rodičovský portál, účastníci, zdraví, pošta, program, kuchyně,
              účtenky, banka i vstupenky na jednom místě místo desítek tabulek. Hlavní
              vedoucí má pod kontrolou svou akci, účetní na konci přebírá hotové podklady.
            </p>

            <button
              onClick={handleSignIn}
              disabled={busy}
              className="rounded-lg bg-ember px-5 py-2.5 text-[14px] font-medium text-night transition-colors hover:bg-ember-hover disabled:opacity-60"
            >
              {busy ? "Přihlašování…" : "Přihlásit se přes Google"}
            </button>

            {error && <p className="text-[13px] text-ink-secondary">{error}</p>}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-mist bg-paper-2 p-6">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-secondary">
              Jak to funguje
            </h2>
            <ol className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink">
              <li>
                <span className="font-medium text-ember">1.</span> Organizace si nastaví šablony, Lidi a vzhled veřejných stránek.
              </li>
              <li>
                <span className="font-medium text-ember">2.</span> Založíte akci, zapnete moduly, které potřebuje, a přidělíte lidem přístup.
              </li>
              <li>
                <span className="font-medium text-ember">3.</span> Rodiče se přihlásí přes veřejnou přihlášku, dokumenty a zprávy chodí do aplikace.
              </li>
              <li>
                <span className="font-medium text-ember">4.</span> Během akce tým nahrává účtenky, vede zdravotní deník, kuchyni a program.
              </li>
              <li>
                <span className="font-medium text-ember">5.</span> Na konci exportujete podklady pro účetní, rodičům pošlete souhrny a vyúčtování.
              </li>
            </ol>
          </div>
        </div>

        {/* Modules */}
        <div>
          <h2 className="mb-2 text-[13px] font-medium uppercase tracking-wide text-ink-secondary">Moduly</h2>
          <p className="mb-6 max-w-2xl text-[14px] text-ink-secondary">Každá akce si zapne jen to, co potřebuje. Vypnutý modul zmizí z menu, data zůstanou.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, body, shot }) => (
              <div key={title} className="flex flex-col rounded-lg border border-mist p-5">
                <Icon size={18} className="mb-3 text-ember" aria-hidden="true" />
                <h3 className="mb-1.5 text-[15px] font-medium">{title}</h3>
                <p className="text-[14px] leading-relaxed text-ink-secondary">{body}</p>
                {/* ponytail: screenshot hides itself until /public/landing/<shot>.jpg is added */}
                <a href={`/landing/${shot}.jpg`} target="_blank" rel="noopener" className="mt-auto block pt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/landing/${shot}.jpg`} alt={`Ukázka: ${title}`} loading="lazy" className="rounded-md border border-mist transition-opacity hover:opacity-90" onError={(e) => (e.currentTarget.hidden = true)} />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Organizations + publishing */}
        <div className="grid gap-4 sm:grid-cols-2">
          {ORG.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-mist bg-paper-2 p-6">
              <Icon size={18} className="mb-3 text-ember" aria-hidden="true" />
              <h3 className="mb-1.5 text-[15px] font-medium">{title}</h3>
              <p className="text-[14px] leading-relaxed text-ink-secondary">{body}</p>
            </div>
          ))}
        </div>

        {/* Testing / access note */}
        <div className="flex flex-col gap-3 border-t border-mist pt-10">
          <h2 className="text-[15px] font-medium">Testovací provoz, zdarma, bez záruky</h2>
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-secondary">
            Táborník je neziskový projekt jednoho člověka, ne firma ani placená služba. Je ve
            vývoji: funkce se mění, mohou se objevit chyby a provoz může být přerušen. Používáte
            ho zdarma a na vlastní odpovědnost – důležitá data si průběžně exportujte. Provoz
            (server, AI rozpoznávání účtenek) zatím platím ze svého, proto přístup dávám ručně
            organizacím, se kterými se domluvím. Chcete to zkusit? Napište mi.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="mailto:pavel.skuhrovec@gmail.com" className="flex w-fit items-center gap-2 text-[14px] text-ember hover:text-ember-hover">
              <MailIcon size={15} aria-hidden="true" />
              pavel.skuhrovec@gmail.com
            </a>
            <Link href="/login/podminky" className="text-[14px] text-ember hover:text-ember-hover">
              Podmínky používání
            </Link>
          </div>
        </div>

        <p className="text-[12px] text-ink-secondary">Osobní neziskový projekt, ne firma. Přihlášením souhlasíte s <Link href="/login/podminky" className="underline">podmínkami používání</Link>.</p>
      </div>
    </div>
  );
}
