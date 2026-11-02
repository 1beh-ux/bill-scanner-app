// 2026-11-02: Osobní účtenky -- editing a bill after someone paid (paid parts stay, additions are new parts). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("personalBills.editPaidHint", "Někdo už zaplatil – jeho zaplacená část zůstane, ostatní jde upravit.", "Someone already paid – their paid part stays, the rest can be edited."),
  r("personalBills.paidEditHint", "Zaplacené části zůstávají, jak jsou. U každého je celková částka / počet: co přidáte navíc, vznikne jako nová část k zaplacení. Méně, než už kdo zaplatil, zadat nejde.", "Paid parts stay as they are. Each person shows their total amount / count: whatever you add becomes a new part to pay. You can't go below what someone already paid."),
  r("personalBills.paidPart", "zaplaceno {amount}", "paid {amount}"),
  r("personalBills.authorLockedPaid", "Někdo už zaplatil – kdo platil a vyúčtování přes akci zůstávají.", "Someone already paid – who paid and settling through the event stay."),
  r("personalBills.error.below_paid", "Někomu jste zadali méně, než už zaplatil. Zaplacenou část nejde snížit – nejdřív vraťte „Zaplaceno“ na stránce Platby.", "Someone got less than they already paid. A paid part can't be lowered – undo “Paid” on Payments first."),
  r("personalBills.error.settled_author_locked", "Někdo už zaplatil – kdo platil a vyúčtování přes akci nejde změnit.", "Someone already paid – who paid and settling through the event can't change."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} personal bills 5 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
