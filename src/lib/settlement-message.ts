// The text sent with a Vyúčtování link (Platby -> "Kopírovat s textem"): four variants by what the person has --
// only consumed (owes), only paid for the event (owed), both and in the end they pay (bothOwes), both and in the
// end the event pays them (bothOwed). Variables:
// {jmeno} {akce} {castka} (to pay, or to get) {zaplatit} {dostanes} {odkaz}. Pure, client-safe.
export type MessageCase = "owes" | "owed" | "bothOwes" | "bothOwed";
export const MESSAGE_CASES: MessageCase[] = ["owes", "owed", "bothOwes", "bothOwed"];
export type Messages = Record<MessageCase, string>;

export const DEFAULT_MESSAGES: Messages = {
  owes: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co sis objednával(a) nebo vypil(a). Vychází, že máš zaplatit {castka}, QR kód najdeš v odkazu: {odkaz}",
  owed: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co jsi za akci platil(a). Vychází, že ti pošlu {castka}. Potvrď mi prosím v odkazu, že to tak sedí: {odkaz}",
  bothOwes: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co jsi platil(a) i co sis objednával(a)/vypil(a). Po započtení vychází, že máš zaplatit {castka}, QR kód je v odkazu: {odkaz}",
  bothOwed: "Ahoj {jmeno}, posílám vyúčtování akce {akce} – koukni, jestli tam máš všechno, co jsi platil(a) i co sis objednával(a)/vypil(a). Po započtení ti pošlu {castka} – potvrď mi prosím v odkazu, že to sedí: {odkaz}",
};

/** Saved texts (any may be missing / empty) over the defaults; an older single "both" text fills both "both" cases. */
export const messagesOf = (raw: unknown): Messages => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<MessageCase | "both", unknown>>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const pick = (k: MessageCase) => str(o[k]) ?? (k === "bothOwes" || k === "bothOwed" ? str(o.both) : null) ?? DEFAULT_MESSAGES[k];
  return { owes: pick("owes"), owed: pick("owed"), bothOwes: pick("bothOwes"), bothOwed: pick("bothOwed") };
};

/**
 * The case: gets = the event or someone owes them; pays = their own parts or a debt to someone. Both: which way
 * the whole result goes (net with the event + what people owe them - what they owe people; even = "bothOwed").
 */
export function messageCase(o: { official: number; personalIn: number; personalOut: number; owedByPeople: number; owesPeople: number; net: number }): MessageCase {
  const gets = o.official > 0.004 || o.personalIn > 0.004 || o.owedByPeople > 0.004;
  const pays = o.personalOut > 0.004 || o.owesPeople > 0.004;
  if (gets && pays) return o.net + o.owedByPeople - o.owesPeople < -0.004 ? "bothOwes" : "bothOwed";
  return pays ? "owes" : "owed";
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
