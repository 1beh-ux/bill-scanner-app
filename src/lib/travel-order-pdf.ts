// Cestovní příkaz PDF (prompt 7 B2): two A4 pages, one file -- page 1 CESTOVNÍ PŘÍKAZ, page 2 VYÚČTOVÁNÍ PRACOVNÍ
// CESTY with the payment QR. Texts are Translation keys "travelPdf.*" (cs, the defaults below when missing);
// the place for "V … dne" is the organization's city. Rendered by the PDF service (src/lib/pdf-service.ts).
import QRCode from "qrcode";
import type { TravelLeg, TravelOrder } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf-service";
import { buildSpaydString, czechAccountToIban } from "@/lib/qr-platba";
import type { CalcResult } from "@/lib/travel-order-calc";

export const TRAVEL_PDF_DEFAULTS: Record<string, string> = {
  "travelPdf.title1": "CESTOVNÍ PŘÍKAZ",
  "travelPdf.title2": "VYÚČTOVÁNÍ PRACOVNÍ CESTY",
  "travelPdf.ico": "IČ",
  "travelPdf.worker": "Pracovník",
  "travelPdf.address": "Bydliště",
  "travelPdf.phone": "Telefon",
  "travelPdf.start": "Začátek cesty (místo, datum, hodina)",
  "travelPdf.destination": "Místo jednání",
  "travelPdf.purpose": "Účel cesty",
  "travelPdf.end": "Konec cesty (místo, datum, hodina)",
  "travelPdf.roundTrip": "tam i zpět",
  "travelPdf.coTravellers": "Spolucestující",
  "travelPdf.transport": "Určený dopravní prostředek",
  "travelPdf.ownCar": "vlastní osobní automobil (AUV)",
  "travelPdf.vehicle": "Vozidlo",
  "travelPdf.plate": "SPZ",
  "travelPdf.cc": "Obsah válců",
  "travelPdf.consumption": "Průměrná spotřeba",
  "travelPdf.fuel": "Palivo",
  "travelPdf.workerVehicle": "Pracovník / vozidlo",
  "travelPdf.payout": "Vyplatit",
  "travelPdf.payoutBank": "převodem na účet",
  "travelPdf.payoutCash": "v hotovosti",
  "travelPdf.payee": "Příjemce",
  "travelPdf.declaration": "Pracovník souhlasí s použitím vlastního osobního automobilu k této pracovní cestě a prohlašuje, že vozidlo je způsobilé k provozu a má sjednané povinné ručení.",
  "travelPdf.inCityOn": "V {city} dne {date}",
  "travelPdf.signWorker": "Podpis pracovníka",
  "travelPdf.signApprover": "Schválil",
  "travelPdf.colDate": "Datum",
  "travelPdf.colRoute": "Odjezd – příjezd",
  "travelPdf.colTrailer": "Přívěs",
  "travelPdf.colKm": "km",
  "travelPdf.colFare": "Jízdné",
  "travelPdf.colMeals": "Stravné",
  "travelPdf.colLodging": "Nocležné",
  "travelPdf.colOther": "Vedlejší",
  "travelPdf.colTotal": "Celkem",
  "travelPdf.sum": "Součet",
  "travelPdf.toPay": "K výplatě (zaokrouhleno)",
  "travelPdf.totalKm": "Celkem km",
  "travelPdf.price": "Cena PHM",
  "travelPdf.fuelCost": "Náhrada za PHM",
  "travelPdf.kmRate": "Základní náhrada (km × sazba)",
  "travelPdf.rates": "Sazby platné od {date}",
  "travelPdf.receiptPrice": "cena z účtenky",
  "travelPdf.free": "Bezplatně poskytnuto",
  "travelPdf.free.ubytovani": "ubytování",
  "travelPdf.free.snidane": "snídaně",
  "travelPdf.free.obed": "oběd",
  "travelPdf.free.vecere": "večeře",
  "travelPdf.yes": "ano",
  "travelPdf.no": "ne",
  "travelPdf.statement": "Prohlašuji, že jsem všechny údaje uvedl plně a správně.",
  "travelPdf.qr": "QR platba",
  "travelPdf.fuel.diesel": "nafta",
  "travelPdf.fuel.petrol95": "Natural 95",
  "travelPdf.fuel.petrol98": "Natural 98",
  "travelPdf.fuel.electric": "elektřina",
  "travelPdf.source.tp": "z TP",
  "travelPdf.source.table": "dle tabulky",
};

type Order = TravelOrder & { legs: TravelLeg[] };
type Org = { name: string; address: string | null; ico: string | null; city: string | null };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (s: string | number) => Number(s).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string | number, d = 1) => Number(s).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: 4 });
const czDay = (d: Date | null) => (d ? `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}` : "");
const czWall = (d: Date | null) => (d ? `${czDay(d)} ${d.toISOString().slice(11, 16)}` : "");

/** The page HTML (pure: everything it shows comes in). */
export function travelOrderHtml(o: Order, calc: CalcResult, org: Org, t: (k: string, p?: Record<string, string>) => string, qrDataUrl: string | null): string {
  const fm = (o.freeMeals ?? {}) as Record<string, boolean>;
  const rates = (o.rateValues ?? {}) as { validFrom?: string; note?: string | null };
  const payout = o.payoutMethod === "cash" ? t("travelPdf.payoutCash") : `${t("travelPdf.payoutBank")} ${esc(o.payoutAccountNumber)}/${esc(o.payoutBankCode)}`;
  const legsById = new Map(calc.legs.map((l) => [l.index, l]));
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const header = `<div class="org"><b>${esc(org.name)}</b>${org.address ? `<br>${esc(org.address)}` : ""}${org.ico ? `<br>${esc(t("travelPdf.ico"))}: ${esc(org.ico)}` : ""}</div>`;
  const place = (o.approvalDate || o.submittedAt) ? t("travelPdf.inCityOn", { city: org.city ?? "…", date: czDay(o.approvalDate ?? o.submittedAt) }) : t("travelPdf.inCityOn", { city: org.city ?? "…", date: "…" });
  const workerVehicle = `
    <div class="box"><h3>${esc(t("travelPdf.workerVehicle"))}</h3>
      ${esc(o.workerName)}${o.workerAddress ? `, ${esc(o.workerAddress)}` : ""}${o.workerPhone ? `, ${esc(o.workerPhone)}` : ""}<br>
      ${esc(o.vehicleLabel)}${o.vehiclePlate ? `, ${esc(t("travelPdf.plate"))} ${esc(o.vehiclePlate)}` : ""}${o.cylinderCc ? `, ${o.cylinderCc} cm³` : ""}, ${esc(t(`travelPdf.fuel.${o.fuel}`))}, ${num(calc.consumption, 2)} l/100 km (${esc(t(`travelPdf.source.${calc.consumptionSource}`))})
    </div>
    <div class="box"><h3>${esc(t("travelPdf.payout"))}</h3>${esc(t("travelPdf.payee"))}: ${esc(o.payoutName ?? o.workerName)}<br>${payout}</div>`;

  const legRows = o.legs
    .filter((l) => legsById.has(o.legs.indexOf(l)))
    .map((l) => {
      const c = legsById.get(o.legs.indexOf(l))!;
      const route = `${esc(l.fromPlace)} ${esc(l.departTime ?? "")} – ${esc(l.toPlace)} ${esc(l.arriveTime ?? "")}`;
      const amt = (v: unknown) => (v ? money(String(v)) : "");
      return `<tr><td>${czDay(l.date)}</td><td>${route}</td><td class="c">${l.trailer ? "✓" : ""}</td><td class="n">${num(c.km)}</td><td class="n">${money(c.kmAmount)}</td><td class="n">${amt(l.stravne)}</td><td class="n">${amt(l.nocleh)}</td><td class="n">${amt(l.vedlejsi)}</td><td class="n">${money(c.total)}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 10pt; margin: 0; }
  h1 { font-size: 16pt; text-align: center; margin: 6mm 0 4mm; letter-spacing: 0.5pt; }
  h3 { font-size: 9pt; text-transform: uppercase; color: #555; margin: 0 0 1mm; }
  .org { font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; }
  .form th { text-align: left; width: 38%; font-weight: normal; color: #444; vertical-align: top; }
  .form th, .form td { border-bottom: 0.5pt solid #bbb; padding: 1.6mm 1mm; }
  .legs th, .legs td { border: 0.5pt solid #999; padding: 1.2mm; font-size: 9pt; }
  .legs th { background: #eee; }
  .n { text-align: right; white-space: nowrap; } .c { text-align: center; }
  .boxes { display: flex; gap: 4mm; margin: 4mm 0; } .box { flex: 1; border: 0.6pt solid #888; padding: 2mm 3mm; }
  .decl { margin: 4mm 0; font-size: 9.5pt; }
  .signs { display: flex; gap: 10mm; margin-top: 14mm; } .signs div { flex: 1; border-top: 0.6pt solid #333; padding-top: 1mm; text-align: center; font-size: 9pt; }
  .page2 { page-break-before: always; }
  .sum td { font-weight: bold; }
  .summary td { padding: 0.8mm 1mm; } .summary td:last-child { text-align: right; }
  .qr { text-align: center; margin-top: 4mm; } .qr img { width: 34mm; height: 34mm; }
  </style></head><body>
  ${header}
  <h1>${esc(t("travelPdf.title1"))}</h1>
  <table class="form">
    ${row(t("travelPdf.worker"), esc(o.workerName))}
    ${row(t("travelPdf.address"), esc(o.workerAddress))}
    ${row(t("travelPdf.phone"), esc(o.workerPhone))}
    ${row(t("travelPdf.start"), `${esc(o.originPlace)}, ${czWall(o.startAt)}`)}
    ${row(t("travelPdf.destination"), `${esc(o.destinationPlace)}${o.roundTrip ? ` (${esc(t("travelPdf.roundTrip"))})` : ""}`)}
    ${row(t("travelPdf.purpose"), esc(o.purpose))}
    ${row(t("travelPdf.end"), `${esc(o.roundTrip ? o.originPlace : o.destinationPlace)}, ${czWall(o.endAt)}`)}
    ${row(t("travelPdf.coTravellers"), esc(o.coTravellers))}
    ${row(t("travelPdf.transport"), esc(t("travelPdf.ownCar")))}
    ${row(t("travelPdf.vehicle"), `${esc(o.vehicleLabel)}${o.cylinderCc ? `, ${esc(t("travelPdf.cc"))} ${o.cylinderCc} cm³` : ""}`)}
    ${row(t("travelPdf.consumption"), `${num(calc.consumption, 2)} l/100 km, ${esc(t("travelPdf.fuel"))}: ${esc(t(`travelPdf.fuel.${o.fuel}`))}`)}
    ${row(t("travelPdf.plate"), esc(o.vehiclePlate))}
    ${row(t("travelPdf.payout"), `${payout} – ${esc(o.payoutName ?? o.workerName)}`)}
  </table>
  <div class="boxes">${workerVehicle}</div>
  <p class="decl">${esc(t("travelPdf.declaration"))}</p>
  <p>${esc(place)}</p>
  <div class="signs"><div>${esc(t("travelPdf.signWorker"))}</div><div>${esc(t("travelPdf.signApprover"))}${o.approverName ? `: ${esc(o.approverName)}` : ""}</div></div>

  <div class="page2">
  ${header}
  <h1>${esc(t("travelPdf.title2"))}</h1>
  <p>${esc(t("travelPdf.worker"))}: <b>${esc(o.workerName)}</b> · ${esc(o.purpose)}</p>
  <table class="legs">
    <tr><th>${esc(t("travelPdf.colDate"))}</th><th>${esc(t("travelPdf.colRoute"))}</th><th>${esc(t("travelPdf.colTrailer"))}</th><th>${esc(t("travelPdf.colKm"))}</th><th>${esc(t("travelPdf.colFare"))}</th><th>${esc(t("travelPdf.colMeals"))}</th><th>${esc(t("travelPdf.colLodging"))}</th><th>${esc(t("travelPdf.colOther"))}</th><th>${esc(t("travelPdf.colTotal"))}</th></tr>
    ${legRows}
    <tr class="sum"><td colspan="3">${esc(t("travelPdf.sum"))}</td><td class="n">${num(calc.totalKm)}</td><td colspan="4"></td><td class="n">${money(calc.legsSum)}</td></tr>
    <tr class="sum"><td colspan="8">${esc(t("travelPdf.toPay"))}</td><td class="n">${money(calc.total)} Kč</td></tr>
  </table>
  <table class="summary" style="width:60%;margin-top:4mm">
    <tr><td>${esc(t("travelPdf.totalKm"))}</td><td>${num(calc.totalKm)} km</td></tr>
    <tr><td>${esc(t("travelPdf.consumption"))}</td><td>${num(calc.consumption, 2)} l/100 km</td></tr>
    <tr><td>${esc(t("travelPdf.price"))}${calc.priceFromReceipt ? ` (${esc(t("travelPdf.receiptPrice"))})` : ""}</td><td>${money(calc.price)} Kč</td></tr>
    <tr><td>${esc(t("travelPdf.fuelCost"))}</td><td>${money(calc.fuelCost)} Kč</td></tr>
    <tr><td>${esc(t("travelPdf.kmRate"))}</td><td>${money(calc.kmRateAmount)} Kč</td></tr>
    <tr><td colspan="2" style="text-align:left;color:#555;font-size:8.5pt">${esc(t("travelPdf.rates", { date: rates.validFrom ? czDay(new Date(`${rates.validFrom}T00:00:00Z`)) : "" }))}${rates.note ? ` – ${esc(rates.note)}` : ""}</td></tr>
  </table>
  <p>${esc(t("travelPdf.free"))}: ${["ubytovani", "snidane", "obed", "vecere"].map((k) => `${esc(t(`travelPdf.free.${k}`))} ${esc(fm[k] ? t("travelPdf.yes") : t("travelPdf.no"))}`).join(", ")}</p>
  <p class="decl">${esc(t("travelPdf.statement"))}</p>
  <p>${esc(place)}</p>
  <div class="signs"><div>${esc(t("travelPdf.signWorker"))}</div><div>${esc(t("travelPdf.signApprover"))}${o.approverName ? `: ${esc(o.approverName)}` : ""}</div></div>
  ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt=""><div>${esc(t("travelPdf.qr"))}: ${money(calc.total)} Kč</div></div>` : ""}
  </div>
  </body></html>`;
}

/** Texts + organization + QR, then the PDF bytes. */
export async function travelOrderPdfHtml(o: Order, calc: CalcResult): Promise<string> {
  const [org, rows] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: o.organizationId }, select: { name: true, address: true, ico: true, city: true } }),
    prisma.translation.findMany({ where: { key: { startsWith: "travelPdf." } }, select: { key: true, cs: true } }),
  ]);
  const texts = { ...TRAVEL_PDF_DEFAULTS, ...Object.fromEntries(rows.filter((r) => r.cs).map((r) => [r.key, r.cs])) };
  const t = (k: string, p?: Record<string, string>) => Object.entries(p ?? {}).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), texts[k] ?? k);
  const iban = o.payoutMethod === "bank" && o.payoutAccountNumber && o.payoutBankCode ? czechAccountToIban(o.payoutAccountNumber, o.payoutBankCode) : null;
  const qr = iban ? await QRCode.toDataURL(buildSpaydString(iban, Number(calc.total), `Cestovni prikaz ${o.workerName ?? ""}`), { margin: 1, width: 240 }) : null;
  return travelOrderHtml(o, calc, org, t, qr);
}

export async function renderTravelOrderPdf(o: Order, calc: CalcResult): Promise<Buffer> {
  return renderPdf(await travelOrderPdfHtml(o, calc), "A4");
}
