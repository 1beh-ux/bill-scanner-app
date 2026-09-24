// Integration check for the Planning module's persistence against a real
// Postgres: every PlanOp's persisted result must equal the pure applyOp result;
// plus base-library import, cross-event reference validation, copy-from-event.
// Creates events -- refuses anything but a local throwaway database:
//   docker run -d --rm --name pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres npx prisma migrate deploy
//   DATABASE_URL=... npx tsx scripts/verify-planning-db.ts
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("verify-planning-db: DATABASE_URL must point at a local throwaway database");
  process.exit(1);
}
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { copyPlanDay, loadPlanPayload, loadPlanState, persistPlanDiff } from "../src/lib/planning-server";
import { scheduleDays, scheduleRows } from "../src/lib/planning-export";
import { scheduleHtml } from "../src/lib/planning-pdf";
import { runImport } from "../src/lib/planning-import-run";
import { applyOp, type PlanOp } from "../src/lib/planning-moves";
import { copyActivitiesFromEvent, importBaseActivities, parseActivityInput, saveActivitiesAsTemplates, templateStatuses } from "../src/lib/planning-activities";
import type { PlanState } from "../src/lib/planning";

const norm = (s: PlanState) => ({
  slots: [...s.slots].sort((a, b) => a.id.localeCompare(b.id)),
  blocks: [...s.blocks].sort((a, b) => a.id.localeCompare(b.id)),
});

async function main() {
  const mk = (name: string) => prisma.event.create({ data: { name, startDate: new Date("2026-07-10"), endDate: new Date("2026-07-20") } });
  const ev = await mk("Tábor");
  const ev2 = await mk("Tábor 2");
  const cat = await prisma.eventListItem.create({ data: { eventId: ev.id, kind: "plan_category", name: "Hra", data: { group: "primary", color: "#f00" } } });
  const leader = await prisma.eventListItem.create({ data: { eventId: ev.id, kind: "plan_leader", name: "Tom" } });
  const foreignLeader = await prisma.eventListItem.create({ data: { eventId: ev2.id, kind: "plan_leader", name: "Tom" } });
  const tpl = await prisma.listTemplate.create({ data: { kind: "plan_activity", name: "Honička", data: { defaultDurationMin: 45, primaryCategoryName: "hra" } } });

  // Base import resolves category by name (case-insensitive), is idempotent, returns ids.
  const imp = await importBaseActivities(ev.id, [tpl.id]);
  assert.equal(imp.added, 1);
  const act = await prisma.planActivity.findUniqueOrThrow({ where: { id: imp.idsByTemplate[tpl.id] } });
  assert.deepEqual(act.categories, [{ categoryId: cat.id, minutes: null }]);
  assert.equal(act.defaultDurationMin, 45);
  assert.equal((await importBaseActivities(ev.id, [tpl.id])).added, 0);

  // References must be this event's items of the right kind.
  assert.deepEqual(await parseActivityInput(ev.id, { defaultLeaderId: foreignLeader.id }, true), { error: "invalid_reference" });
  assert.deepEqual(await parseActivityInput(ev.id, { defaultLeaderId: cat.id }, true), { error: "invalid_reference" });
  assert.ok("data" in (await parseActivityInput(ev.id, { name: "X", defaultDurationMin: 30, defaultLeaderId: leader.id }, false)));
  assert.deepEqual(await parseActivityInput(ev.id, { name: "X", defaultDurationMin: 3 }, false), { error: "invalid_duration" });

  // Day + windows.
  const day = await prisma.planDay.create({
    data: {
      eventId: ev.id, label: "Den 1", sortOrder: 0,
      windows: { create: [
        { name: "Dopoledne", startMin: 540, endMin: 720, kind: "flexible", sortOrder: 0 },
        { name: "Oběd", startMin: 720, endMin: 780, kind: "fixed", sortOrder: 1 },
        { name: "Odpoledne", startMin: 780, endMin: 1020, kind: "flexible", sortOrder: 2 },
      ] },
    },
    include: { windows: true },
  });
  const [am, , pm] = day.windows.sort((a, b) => a.sortOrder - b.sortOrder);
  const block = { activityId: act.id, customName: null, description: null, categories: [{ categoryId: cat.id, minutes: null }], leaderId: leader.id, locationId: null, notes: null, groupNames: ["Vlci"] };

  async function run(op: (s: PlanState) => PlanOp) {
    let expected!: PlanState;
    await prisma.$transaction(async (tx) => {
      const { state } = await loadPlanState(ev.id, tx);
      expected = applyOp(state, op(state), randomUUID);
      await persistPlanDiff(tx, state, expected);
    });
    const { state: stored } = await loadPlanState(ev.id);
    assert.deepEqual(norm(stored), norm(expected));
    return stored;
  }
  const slotsIn = (s: PlanState, w: string) => s.slots.filter((x) => x.windowId === w).sort((a, b) => a.position - b.position);

  let s = await run(() => ({ op: "insert", target: { windowId: am.id, index: 0 }, durationMin: 45, block }));
  s = await run(() => ({ op: "insert", target: { windowId: am.id, index: 1 }, durationMin: 30, block: { ...block, customName: "B" } }));
  s = await run(() => ({ op: "insert", target: { windowId: am.id, index: 0 }, durationMin: 60, block: { ...block, customName: "C" } }));
  assert.deepEqual(slotsIn(s, am.id).map((x) => x.position), [0, 1, 2]);
  const [first, second, third] = slotsIn(s, am.id);
  s = await run(() => ({ op: "insert", target: { slotId: second.id }, durationMin: 0, block: { ...block, customName: "parallel" } }));
  s = await run(() => ({ op: "move", kind: "slot", id: first.id, target: { windowId: pm.id, index: 0 }, copy: true }));
  s = await run(() => ({ op: "move", kind: "slot", id: third.id, target: { windowId: am.id, index: 0 }, copy: false }));
  const par = s.blocks.find((b) => b.customName === "parallel")!;
  s = await run(() => ({ op: "move", kind: "block", id: par.id, target: { windowId: pm.id, index: 1 }, copy: false }));
  s = await run(() => ({ op: "move", kind: "slot", id: second.id, target: { slotId: third.id }, copy: false }));
  s = await run(() => ({ op: "resize", slotId: third.id, durationMin: 95 }));
  s = await run((st) => ({ op: "deleteBlock", blockId: st.blocks.find((b) => b.slotId === third.id)!.id }));
  s = await run(() => ({ op: "deleteSlot", slotId: third.id }));
  assert.deepEqual(slotsIn(s, am.id).map((x) => x.position), [...slotsIn(s, am.id).keys()]);

  // Fixed window rejected, nothing persisted.
  await assert.rejects(run(() => ({ op: "move", kind: "slot", id: slotsIn(s, pm.id)[0].id, target: { windowId: day.windows[1].id, index: 0 }, copy: false })));

  // Copy library to another event: leader re-resolved by name there.
  await prisma.planActivity.update({ where: { id: act.id }, data: { defaultLeaderId: leader.id } });
  assert.equal((await copyActivitiesFromEvent(ev2.id, ev.id)).added, 1);
  const copied = await prisma.planActivity.findFirstOrThrow({ where: { eventId: ev2.id } });
  assert.equal(copied.defaultLeaderId, foreignLeader.id);
  assert.deepEqual(copied.categories, []); // ev2 has no "Hra" category

  // Full day copy (windows + slots + blocks) and the flat export rows.
  const before = await loadPlanState(ev.id);
  const copy = await copyPlanDay(ev.id, day.id, { sortOrder: 1, date: null, label: "Den 2" });
  assert.ok(copy);
  assert.equal(await copyPlanDay(ev2.id, day.id, { sortOrder: 0, date: null, label: "x" }), null); // other event's day
  const after = await loadPlanState(ev.id);
  assert.equal(after.state.slots.length, before.state.slots.length * 2);
  assert.equal(after.state.blocks.length, before.state.blocks.length * 2);
  const rows = scheduleRows(await loadPlanPayload(ev.id));
  assert.equal(rows.length, after.state.blocks.length);
  assert.deepEqual([...new Set(rows.map((r) => r.dayLabel))], ["Den 1", "Den 2"]);
  assert.equal(scheduleRows(await loadPlanPayload(ev.id), { leaderId: leader.id }).every((r) => r.leader === "Tom"), true);
  // Groups survive moves/copies/day copy (the run() deepEquals above include groupNames) and filter exports.
  assert.ok(after.state.blocks.every((b) => b.groupNames.join() === "Vlci"));
  assert.equal(scheduleRows(await loadPlanPayload(ev.id), { group: "Vlci" }).length, rows.length);
  assert.equal(scheduleRows(await loadPlanPayload(ev.id), { group: "Lišky" }).length, 0);
  await prisma.participant.create({ data: { eventId: ev.id, name: "Anna", groupName: "Lišky" } });
  assert.deepEqual((await loadPlanPayload(ev.id)).groups, ["Lišky", "Vlci"]);
  await prisma.planDay.delete({ where: { id: copy.id } });

  // Cascade: deleting the day removes everything under it.
  await prisma.planDay.delete({ where: { id: day.id } });
  assert.equal(await prisma.planSlot.count(), 0);
  assert.equal(await prisma.planBlock.count(), 0);
  // ---- Event library <-> org templates ---------------------------------------
  {
    const base = Object.values(imp.idsByTemplate)[0] as string;
    const statusOf = async (id: string) => (await templateStatuses(ev.id, await prisma.planActivity.findMany({ where: { id } }))).get(id);
    assert.equal(await statusOf(base), "template");
    await prisma.planActivity.update({ where: { id: base }, data: { defaultDurationMin: 50 } });
    assert.equal(await statusOf(base), "modified");
    assert.deepEqual(await saveActivitiesAsTemplates(ev.id, [base]), { created: 0, updated: 1 });
    assert.equal(await statusOf(base), "template");
    assert.equal(((await prisma.listTemplate.findUniqueOrThrow({ where: { id: tpl.id } })).data as { defaultDurationMin: number }).defaultDurationMin, 50);
    const local = await prisma.planActivity.create({ data: { eventId: ev.id, name: "Jen tady", defaultDurationMin: 20, categories: [{ categoryId: cat.id, minutes: 5 }] } });
    assert.equal(await statusOf(local.id), "local");
    assert.deepEqual(await saveActivitiesAsTemplates(ev.id, [local.id]), { created: 1, updated: 0 });
    const linked = await prisma.planActivity.findUniqueOrThrow({ where: { id: local.id } });
    const newTpl = await prisma.listTemplate.findUniqueOrThrow({ where: { id: linked.sourceTemplateId! } });
    assert.deepEqual((newTpl.data as { categories: unknown }).categories, [{ name: "Hra", minutes: 5 }]);
    assert.equal(await statusOf(local.id), "template");
  }

  // ---- Import (runImport) on a separate event --------------------------------
  const ev3 = await mk("Import");
  const opts = { mode: "replace" as const, createMissing: true };
  // Lists: create, then update by name (case-insensitive), parsed fields.
  await runImport(ev3.id, "leaders", [{ name: "Tom", phone: "123" }], opts, false);
  const lead = await runImport(ev3.id, "leaders", [{ name: "tom", role: "hlavní" }, { name: "Eva" }], opts, false);
  assert.deepEqual(lead.counts, { updated: 1, created: 1 });
  const tom = await prisma.eventListItem.findFirstOrThrow({ where: { eventId: ev3.id, kind: "plan_leader", name: "Tom" } });
  assert.deepEqual(tom.data, { phone: "123", role: "hlavní" });
  const cats = await runImport(ev3.id, "categories", [{ name: "Hra", group: "Hlavní", color: "zelená", targetPercent: "60 %" }, { name: "X", color: "blah" }, { name: "Snídaně", group: "hlavní", countInAnalysis: "ne" }], opts, false);
  assert.deepEqual((await prisma.eventListItem.findFirstOrThrow({ where: { eventId: ev3.id, name: "Snídaně" } })).data, { group: "primary", countInAnalysis: false });
  assert.equal(cats.warnings[0].code, "invalid_color");
  assert.deepEqual((await prisma.eventListItem.findFirstOrThrow({ where: { eventId: ev3.id, name: "Hra" } })).data, { group: "primary", color: "#22c55e", targetPercent: 60 });

  // Activities: missing location created on the fly; bad duration is a warning.
  const acts = await runImport(ev3.id, "activities", [{ name: "Lukostřelba", duration: "1,5 h", location: "Louka", leader: "Eva", primaryCategory: "Hra" }, { name: "Oběd", duration: "??" }], opts, false);
  assert.equal(acts.counts.created, 2);
  assert.equal(acts.counts.plan_locationCreated, 1);
  assert.equal(acts.warnings[0].code, "invalid_duration");
  const archery = await prisma.planActivity.findFirstOrThrow({ where: { eventId: ev3.id, name: "Lukostřelba" } });
  assert.equal(archery.defaultDurationMin, 90);
  assert.ok(archery.defaultLocationId && archery.defaultLeaderId && (archery.categories as unknown[]).length === 1);

  // Category cells with minutes (and a new secondary category) in the activity import.
  await runImport(ev3.id, "activities", [{ name: "Mikrosimulace", duration: "30", primaryCategory: "Teorie 10, Hra 20", secondaryCategory: "Venku" }], opts, false);
  const micro = await prisma.planActivity.findFirstOrThrow({ where: { eventId: ev3.id, name: "Mikrosimulace" } });
  const ids = Object.fromEntries((await prisma.eventListItem.findMany({ where: { eventId: ev3.id, kind: "plan_category" } })).map((c) => [c.name, c]));
  assert.deepEqual(micro.categories, [
    { categoryId: ids["Teorie"].id, minutes: 10 },
    { categoryId: ids["Hra"].id, minutes: 20 },
    { categoryId: ids["Venku"].id, minutes: null },
  ]);
  assert.deepEqual(ids["Venku"].data, { group: "secondary" });

  // Schedule: two days, parallel rows, a gap, a range column, errors skipped.
  const sched: Record<string, string>[] = [
    { date: "10.7.", time: "9:00-10:00", activity: "Rozcvička", groups: "Vlci, Lišky" },
    { date: "10.7.", start: "10:00", activity: "Lukostřelba" }, // 90 min from the library
    { date: "10.7.", start: "10.00", end: "11:30", activity: "Hra v lese", leader: "Tom", groups: "Lišky" },
    { date: "10.7.", start: "14:00", duration: "45", activity: "Koupání", location: "Rybník" },
    { date: "11.7.", start: "9:00", duration: "60", activity: "Výlet" },
    { date: "11.7.", start: "xx", activity: "Špatně" }, // error
    { activity: "Bez dne" }, // error
  ];
  const dry = await runImport(ev3.id, "schedule", sched, opts, true);
  assert.equal(await prisma.planDay.count({ where: { eventId: ev3.id } }), 0); // dry run writes nothing
  assert.deepEqual(dry.errors.map((e) => [e.row, e.code]), [[5, "invalid_start"], [6, "day_required"]]);
  assert.deepEqual(
    [dry.counts.daysCreated, dry.counts.windowsCreated, dry.counts.slotsCreated, dry.counts.blocksCreated, dry.counts.activitiesCreated, dry.counts.plan_locationCreated],
    [2, 3, 4, 5, 4, 1]
  );
  const real = await runImport(ev3.id, "schedule", sched, opts, false);
  assert.deepEqual(real.counts, dry.counts);
  let pl = await loadPlanPayload(ev3.id);
  assert.deepEqual(pl.days.map((d) => [d.label, d.date]), [["Den 1", "2026-07-10"], ["Den 2", "2026-07-11"]]);
  const day1Rows = scheduleRows(pl, { dayIds: new Set([pl.days[0].id]) });
  assert.deepEqual(day1Rows.map((r) => [r.start, r.end, r.activity, r.parallel]), [
    ["09:00", "10:00", "Rozcvička", false],
    ["10:00", "11:30", "Lukostřelba", true],
    ["10:00", "11:30", "Hra v lese", true],
    ["14:00", "14:45", "Koupání", false],
  ]);
  assert.equal(day1Rows[1].location, "Louka"); // empty cell -> activity default
  assert.equal(day1Rows[2].leader, "Tom");
  assert.equal(scheduleRows(pl, { group: "Vlci" }).some((r) => r.activity === "Hra v lese"), false);
  // PDF layout: the parallel slot renders its two branches side by side in one row.
  const html = scheduleHtml({ eventName: "Import", days: scheduleDays(pl), showLeader: true });
  assert.match(html, /<div class="row"><div class="b"[^]*?Lukostřelba[^]*?<div class="b"[^]*?Hra v lese/);

  // Replace re-import is idempotent; append adds; a day whose rows all fail is left alone.
  await runImport(ev3.id, "schedule", sched, opts, false);
  pl = await loadPlanPayload(ev3.id);
  assert.equal(pl.blocks.length, 5);
  await runImport(ev3.id, "schedule", sched.slice(4, 5), { ...opts, mode: "append" }, false);
  assert.equal((await loadPlanPayload(ev3.id)).blocks.length, 6);
  const bad = await runImport(ev3.id, "schedule", [{ date: "10.7.", start: "nope", activity: "X" }], opts, false);
  assert.equal(bad.counts.daysReplaced, undefined);
  assert.equal((await loadPlanPayload(ev3.id)).blocks.length, 6);

  console.log("verify-planning-db: ok");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
