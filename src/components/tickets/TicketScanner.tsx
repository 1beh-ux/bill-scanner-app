"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanTime } from "@/lib/tickets";
import jsQR from "jsqr";
import type { ScanResult } from "@/lib/tickets";

// The door check-in (docs/public-event-tickets-spec.md): the phone's back camera reads the ticket's
// QR (jsQR -- works in every browser, iOS Safari included), or the code is typed in. Each code is
// sent to `api` (POST { code }), which marks it used and answers valid / used / unpaid / cancelled /
// unknown. Used by /events/<id>/tickets/scan (login) and /vstup/<token> (the secret link).
type T = (key: string, vars?: Record<string, string>) => string;
type Counts = { paid: number; used: number };

const STYLE: Record<ScanResult["status"], string> = {
  valid: "bg-pine text-white",
  used: "bg-amber-500 text-white",
  unpaid: "bg-red-600 text-white",
  cancelled: "bg-red-600 text-white",
  unknown: "bg-red-600 text-white",
};
// The same code read again within this time is the same ticket still in front of the camera.
const SAME_CODE_MS = 4000;

export default function TicketScanner({ api, t, initialCounts }: { api: string; t: T; initialCounts?: Counts }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busy = useRef(false);
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [counts, setCounts] = useState<Counts | null>(initialCounts ?? null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      try {
        const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { result: ScanResult; counts: Counts };
        setResult(data.result);
        setCounts(data.counts);
        navigator.vibrate?.(data.result.status === "valid" ? 80 : [200, 100, 200]);
      } catch {
        setError(t("scan.failed"));
      } finally {
        busy.current = false;
      }
    },
    [api, t]
  );

  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        // ~5 frames a second is plenty and keeps an old phone cool.
        timer = setInterval(() => {
          const canvas = canvasRef.current;
          if (!canvas || video.readyState < 2 || busy.current) return;
          const w = 480;
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (!found?.data) return;
          const now = Date.now();
          if (found.data === last.current.code && now - last.current.at < SAME_CODE_MS) return;
          last.current = { code: found.data, at: now };
          check(found.data);
        }, 200);
      } catch {
        setCamera("denied");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [camera, check]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) check(manual.trim());
    setManual("");
  }

  return (
    <div className="flex flex-col gap-4">
      {counts && (
        <p className="text-[15px] text-ink">
          {t("scan.counts", { used: String(counts.used), paid: String(counts.paid) })}
        </p>
      )}

      {camera === "on" ? (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <button onClick={() => setCamera("off")} className="absolute right-2 top-2 rounded-lg bg-black/60 px-3 py-1.5 text-[13px] text-white">
            {t("scan.stop")}
          </button>
        </div>
      ) : (
        <button onClick={() => setCamera("on")} className="rounded-lg bg-ember px-4 py-4 text-[16px] font-medium text-white hover:bg-ember-hover">
          {t("scan.start")}
        </button>
      )}
      {camera === "denied" && <p className="text-[13px] text-red-600">{t("scan.cameraDenied")}</p>}

      {result && (
        <div className={"rounded-lg p-4 " + STYLE[result.status]} role="status" aria-live="assertive">
          <p className="text-[22px] font-bold">{t(`scan.result.${result.status}`)}</p>
          {result.status === "valid" && (
            <p className="text-[16px]">
              {result.buyerName} · {result.priceLabel} · {t("scan.ticketOf", { seq: String(result.seq), count: String(result.count) })} · {t("scan.order", { number: String(result.orderNumber) })}
            </p>
          )}
          {result.status === "used" && (
            <p className="text-[16px]">
              {result.buyerName} · {result.priceLabel} · {t("scan.usedAt", { when: scanTime(result.usedAt) })}
            </p>
          )}
          {(result.status === "unpaid" || result.status === "cancelled") && <p className="text-[16px]">{result.buyerName}</p>}
        </div>
      )}
      {error && <p className="text-[14px] text-red-600">{error}</p>}

      <form onSubmit={submitManual} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("scan.manualPlaceholder")} autoCapitalize="characters" className="min-w-0 flex-1 rounded-lg border border-mist bg-paper px-3 py-2 text-[15px] uppercase text-ink" />
        <button type="submit" className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2">
          {t("scan.check")}
        </button>
      </form>
    </div>
  );
}
