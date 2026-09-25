"use client";
import { getRedirectResult, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";
import { auth, googleProvider, needsSameOriginAuth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tent, Receipt, HeartPulse, Mail as MailIcon } from "lucide-react";

const FEATURES = [
  {
    icon: Receipt,
    title: "Účtenky",
    body: "Foto, nahrání souboru nebo import z Drive. AI přečte obchod a částku, vy jen zařadíte do kategorie a schválíte. Více měn, QR platba pro proplacení, export s manifestem pro účetní.",
  },
  {
    icon: HeartPulse,
    title: "Zdravotní deník",
    body: "Účastníci, zákonní zástupci, výdej léků podle rozpisu, záznamy o úrazech a nemocech s fotkou a mapou těla, souhrny pro rodiče e-mailem i jako PDF.",
  },
  {
    icon: MailIcon,
    title: "Pošta",
    body: "Jedna schránka pro celou akci: došlé přílohy se rovnou přiřadí účastníkovi jako přijatý dokument, hromadné rozeslání stavu rodičům, přehled vyřízeného.",
  },
];

export default function LoginPage() {
  const router = useRouter();
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
    if (needsSameOriginAuth()) {
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
        router.push(me?.landingPath || "/");
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
              <span className="text-[15px] font-medium">Bill Scanner</span>
            </div>

            <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">
              Jedna aplikace pro organizaci táborů — účtenky, zdraví i poštu.
            </h1>

            <p className="max-w-lg text-[16px] leading-relaxed text-ink-secondary">
              Postaveno pro dobrovolnické organizace, co pořádají tábory a pobytové akce.
              Nahradí tabulky v Sheets jedním místem pro celý tým: hlavní vedoucí akce
              vidí a spravuje vše potřebné, hlavní účetní na konci jen přebírá hotové
              podklady.
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
                <span className="font-medium text-ember">1.</span> Vytvoříte akci a
                zapnete moduly, které pro ni potřebujete.
              </li>
              <li>
                <span className="font-medium text-ember">2.</span> Administrátor akce
                průběžně nahrává účtenky, vede zdravotní deník nebo řeší poštu.
              </li>
              <li>
                <span className="font-medium text-ember">3.</span> Na konci akce
                exportujete přehledné podklady — pro účetní, pro rodiče, pro archiv.
              </li>
            </ol>
          </div>
        </div>

        {/* What it does */}
        <div>
          <h2 className="mb-6 text-[13px] font-medium uppercase tracking-wide text-ink-secondary">
            Co aplikace umí
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex-1 rounded-lg border border-mist p-5">
                <Icon size={18} className="mb-3 text-ember" aria-hidden="true" />
                <h3 className="mb-1.5 text-[15px] font-medium">{title}</h3>
                <p className="text-[14px] leading-relaxed text-ink-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Personal / access note */}
        <div className="flex flex-col gap-3 border-t border-mist pt-10">
          <h2 className="text-[15px] font-medium">Je to volný projekt</h2>
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-secondary">
            Postavil jsem to jako neziskový projekt pro dobrovolnické organizace, co
            pořádají tábory — sám jsem měl dost tabulek v Google Sheets. Provoz ale něco
            stojí (server, AI rozpoznávání účtenek), a to zatím platím ze svého, takže
            přístup teď dávám ručně, jen lidem a organizacím, se kterými se domluvím.
            Chcete to zkusit i pro svou organizaci? Napište mi.
          </p>
          <a
            href="mailto:pavel.skuhrovec@gmail.com"
            className="flex w-fit items-center gap-2 text-[14px] text-ember hover:text-ember-hover"
          >
            <MailIcon size={15} aria-hidden="true" />
            pavel.skuhrovec@gmail.com
          </a>
        </div>

        <p className="text-[12px] text-ink-secondary">Osobní projekt, ne firma.</p>
      </div>
    </div>
  );
}
