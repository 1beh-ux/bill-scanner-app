// The text sent with a Vyúčtování link (Platby -> "Kopírovat s textem"): three variants by what the person has --
// only to pay (owes), only to get (owed), both (paid for something and also spent / owes someone). Variables:
// {jmeno} {akce} {castka} (to pay, or to get) {zaplatit} {dostanes} {odkaz}. Pure, client-safe.
export type MessageCase = "owes" | "owed" | "both";
export type Messages = Record<MessageCase, string>;

export const DEFAULT_MESSAGES: Messages = {
  owes: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co sis objednával(a) nebo vypil(a). Vychází, že máš zaplatit {castka}, QR kód najdeš v odkazu: {odkaz}",
  owed: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co jsi za akci platil(a). Vychází, že ti pošlu {castka}. Potvrď mi prosím v odkazu, že to tak sedí: {odkaz}",
  both: "Ahoj, posílám vyúčtování akce {akce} – koukni na to, jestli tam máš všechno (buď pokud jsi platil(a) něco, nebo co sis objednával(a)/vypil(a)). A buď pošli, pokud máš zaplatit ty, a nebo mi potvrď, že je to tak ok, a pošlu ti to já :) {odkaz}",
};

/** Saved texts (any may be missing / empty) over the defaults. */
export const messagesOf = (raw: unknown): Messages => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<MessageCase, unknown>>;
  const pick = (k: MessageCase) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string) : DEFAULT_MESSAGES[k]);
  return { owes: pick("owes"), owed: pick("owed"), both: pick("both") };
};

/** The case: gets = the event or someone owes them; pays = their own parts or a debt to someone. */
export function messageCase(o: { official: number; personalIn: number; personalOut: number; owedByPeople: number; owesPeople: number }): MessageCase {
  const gets = o.official > 0.004 || o.personalIn > 0.004 || o.owedByPeople > 0.004;
  const pays = o.personalOut > 0.004 || o.owesPeople > 0.004;
  return gets && pays ? "both" : pays ? "owes" : "owed";
}

const czk = (n: number) => `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;

/** The message: variables filled; the link appended when the text has no {odkaz}. */
export function fillMessage(template: string, v: { name: string; event: string; net: number; owesPeople: number; owedByPeople: number; link: string }): string {
  const toPay = Math.max(0, -v.net) + v.owesPeople;
  const toGet = Math.max(0, v.net) + v.owedByPeople;
  const vars: Record<string, string> = { jmeno: v.name, akce: v.event, castka: czk(toPay > 0.004 ? toPay : toGet), zaplatit: czk(toPay), dostanes: czk(toGet), odkaz: v.link };
  const out = template.replace(/\{(jmeno|akce|castka|zaplatit|dostanes|odkaz)\}/g, (_, k: string) => vars[k]);
  return template.includes("{odkaz}") ? out : `${out.trimEnd()} ${v.link}`;
}
