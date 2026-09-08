"use client";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Receipt, HeartPulse, Mail as MailIcon } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        setError("Tento účet nemá přístup do aplikace. Přístup uděluje Pavel — napiš mu, ať tě přidá.");
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-16 px-6 py-16 sm:py-24">
        {/* Hero */}
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember">
              <Receipt size={17} className="text-night" aria-hidden="true" />
            </div>
            <span className="text-[15px] font-medium">Bill Scanner</span>
          </div>

          <h1 className="text-[32px] font-medium leading-tight sm:text-[40px]">
            Účtenky a zdravotní deník pro tábory, bez tabulek v Sheets.
          </h1>

          <p className="max-w-lg text-[16px] leading-relaxed text-ink-secondary">
            Nahraješ účtenku, aplikace z ní přečte obchod a částku, ty ji jen zařadíš do kategorie
            a schválíš. Ke každé akci navíc zdravotní deník účastníků — poznámky, léky, záznamy o
            úrazech a souhrny pro rodiče. Na konci export přehledně pro účetní.
          </p>

          <button
            onClick={handleSignIn}
            className="rounded-lg bg-ember px-5 py-2.5 text-[14px] font-medium text-night transition-colors hover:bg-ember-hover"
          >
            Přihlásit se přes Google
          </button>

          {error && <p className="text-[13px] text-ink-secondary">{error}</p>}
        </div>

        {/* What it does */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-lg border border-mist p-5">
            <Receipt size={18} className="mb-3 text-ember" aria-hidden="true" />
            <h2 className="mb-1.5 text-[15px] font-medium">Účtenky</h2>
            <p className="text-[14px] leading-relaxed text-ink-secondary">
              Foto, nahrání souboru nebo import z Drive. Kategorie, více měn, QR platba pro
              proplacení, export s manifestem pro účetní.
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-mist p-5">
            <HeartPulse size={18} className="mb-3 text-ember" aria-hidden="true" />
            <h2 className="mb-1.5 text-[15px] font-medium">Zdravotní deník</h2>
            <p className="text-[14px] leading-relaxed text-ink-secondary">
              Účastníci, zákonní zástupci, výdej léků, záznamy o úrazech a nemocech, souhrny e-mailem
              rodičům.
            </p>
          </div>
        </div>

        {/* Personal / access note */}
        <div className="flex flex-col gap-3 border-t border-mist pt-10">
          <h2 className="text-[15px] font-medium">Je to volný projekt</h2>
          <p className="max-w-lg text-[14px] leading-relaxed text-ink-secondary">
            Postavil jsem to jako neziskový projekt pro dobrovolnické organizace, co pořádají
            tábory — sám jsem měl dost tabulek v Google Sheets. Provoz ale něco stojí (server, AI
            rozpoznávání účtenek), a to platím zatím ze svého, takže přístup teď dávám ručně, jen
            lidem, se kterými se domluvím. Chceš to zkusit i pro svou organizaci? Napiš mi.
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
