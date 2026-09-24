// Self-check for planning-engine + planning-moves: `npx tsx src/lib/planning.check.ts`
import assert from "node:assert/strict";
import type { PlanBlockRow, PlanState } from "@/lib/planning";
import { byPosition, categoryMinutes, computeTimes, findConflicts, mainCategorySegments, summarize } from "@/lib/planning-engine";
import { applyOp } from "@/lib/planning-moves";
import { sanitizeUiPrefs } from "@/lib/ui-prefs";
import { buildSheetModel, DEFAULT_SHEET_STYLE, sanitizeSheetStyle, tint } from "@/lib/planning-sheet";

let n = 0;
const newId = () => `new${++n}`;
const blk = (id: string, slotId: string, branchOrder: number, extra: Partial<PlanBlockRow> = {}): PlanBlockRow => ({
  id, slotId, branchOrder, activityId: null, customName: id, description: null,
  categories: [], leaderId: null, locationId: null, notes: null, groupNames: [], ...extra,
});

const base: PlanState = {
  windows: [
    { id: "am", dayId: "d1", name: "Dopoledne", startMin: 540, endMin: 720, kind: "flexible", color: null, sortOrder: 0 },
    { id: "lunch", dayId: "d1", name: "Oběd", startMin: 720, endMin: 780, kind: "fixed", color: null, sortOrder: 1 },
    { id: "pm", dayId: "d1", name: "Odpoledne", startMin: 780, endMin: 1020, kind: "partial", color: null, sortOrder: 2 },
  ],
  slots: [
    { id: "A", windowId: "am", durationMin: 60, position: 0, notes: null },
    { id: "B", windowId: "am", durationMin: 90, position: 1, notes: null },
    { id: "C", windowId: "am", durationMin: 45, position: 2, notes: null },
  ],
  blocks: [
    blk("a1", "A", 0, { categories: [{ categoryId: "prax", minutes: null }], leaderId: "tom" }),
    blk("b1", "B", 0, { categories: [{ categoryId: "prax", minutes: null }], leaderId: "tom" }),
    blk("b2", "B", 1, { categories: [{ categoryId: "prax", minutes: null }], leaderId: "tom", locationId: "hall" }),
    blk("c1", "C", 0, { categories: [{ categoryId: "teorie", minutes: null }], locationId: "hall" }),
  ],
};
const order = (s: PlanState, w: string) => s.slots.filter((x) => x.windowId === w).sort(byPosition).map((x) => x.id).join("");

// Sequential timing + flexible overflow: 60+90+45 = 195 > 180.
const t = computeTimes(base);
assert.deepEqual([t.slots.A.startMin, t.slots.B.startMin, t.slots.C.startMin, t.slots.C.endMin], [540, 600, 690, 735]);
assert.equal(t.slots.C.overflow, true);
assert.deepEqual(t.windows.am, { windowId: "am", usedMin: 195, capacityMin: 180, freeMin: 0, overflowMin: 15 });

// Parallel slot counts a shared category once; leaders count per branch.
const sum = summarize(base, new Set(["am"]), [{ id: "prax", data: { targetPercent: 60 } }]);
assert.equal(sum.primaryCategories.find((c) => c.categoryId === "prax")?.totalMin, 150);
assert.equal(sum.leaders.find((l) => l.refId === "tom")?.totalMin, 60 + 90 + 90);

// Minute split (categoryMinutes): per group; no minutes = whole duration;
// entered minutes count as entered, scaled down only past the duration;
// categories without minutes share the rest.
const groupOf = (id: string) => (id.startsWith("s:") ? "secondary" : id === "gone" ? null : "primary");
const cm = (shares: [string, number | null][], d: number) =>
  Object.fromEntries(categoryMinutes(shares.map(([categoryId, minutes]) => ({ categoryId, minutes })), d, groupOf));
assert.deepEqual(cm([["teorie", 10], ["prax", 20]], 30), { teorie: 10, prax: 20 });
assert.deepEqual(cm([["teorie", 10], ["prax", 20]], 60), { teorie: 10, prax: 20 }); // resize doesn't rescale
assert.deepEqual(cm([["teorie", 40], ["prax", 20]], 30), { teorie: 20, prax: 10 }); // over -> scaled down
assert.deepEqual(cm([["teorie", 10], ["prax", null]], 30), { teorie: 10, prax: 20 }); // rest
assert.deepEqual(cm([["teorie", null], ["s:venku", null], ["gone", 5]], 30), { teorie: 30, "s:venku": 30 });

// Summary with a split block: mikrosimulace 30 min = teorie 10 + prax 20.
const splitPlan: PlanState = {
  ...base,
  blocks: base.blocks.map((b) =>
    b.id === "c1" ? { ...b, categories: [{ categoryId: "teorie", minutes: 10 }, { categoryId: "prax", minutes: 20 }] } : b
  ),
};
const splitSum = summarize(splitPlan, new Set(["am"]), [{ id: "prax", data: {} }, { id: "teorie", data: {} }]);
assert.equal(splitSum.primaryCategories.find((c) => c.categoryId === "teorie")?.totalMin, 10);
assert.equal(splitSum.primaryCategories.find((c) => c.categoryId === "prax")?.totalMin, 60 + 90 + 20);
assert.equal(splitSum.analysisMin, 60 + 90 + 30);

// Color mark: main categories weighted by minutes; no minutes -> equal parts.
{
  const cats = [{ id: "t", data: { color: "#111111" } }, { id: "p", data: { color: "#222222" } }, { id: "s", data: { group: "secondary" as const } }];
  assert.deepEqual(mainCategorySegments(cats, [{ categoryId: "t", minutes: 10 }, { categoryId: "p", minutes: 5 }, { categoryId: "s", minutes: null }], 15), [
    { color: "#111111", weight: 10 },
    { color: "#222222", weight: 5 },
  ]);
  assert.deepEqual(mainCategorySegments(cats, [{ categoryId: "t", minutes: null }, { categoryId: "p", minutes: null }], 30).map((x) => x.weight), [30, 30]);
}

// Analysis base: switching a primary category off drops its slots from the base.
const withBreakfast = summarize(base, new Set(["am"]), [{ id: "prax", data: {} }, { id: "teorie", data: { countInAnalysis: false } }]);
assert.equal(withBreakfast.analysisMin, 150); // slots A + B (prax); C (teorie) excluded
assert.deepEqual(withBreakfast.primaryCategories.map((c) => [c.categoryId, c.percent]), [["prax", 100]]);

// Conflicts: tom in both branches of B; hall in b2 (B) and c1 (C) don't overlap.
const conflicts = findConflicts(base, () => "d1");
assert.equal(conflicts.length, 1);
assert.deepEqual([conflicts[0].type, conflicts[0].refId], ["leader", "tom"]);

// Groups: overlap only when a group is shared; no groups = everyone, never a conflict.
const grouped: PlanState = {
  ...base,
  blocks: base.blocks.map((b) =>
    b.id === "b1" ? { ...b, leaderId: null, groupNames: ["Vlci", "Lišky"] } : b.id === "b2" ? { ...b, leaderId: null, groupNames: ["Lišky"] } : b
  ),
};
const groupConflicts = findConflicts(grouped, () => "d1").filter((c) => c.type === "group");
assert.deepEqual(groupConflicts.map((c) => c.refId), ["Lišky"]);
assert.equal(summarize(grouped, new Set(["am"]), []).groups.find((g) => g.refId === "Vlci")?.totalMin, 90);

// Reorder within a window, gap index counted with the dragged slot present.
assert.equal(order(applyOp(base, { op: "move", kind: "slot", id: "A", target: { windowId: "am", index: 2 }, copy: false }, newId), "am"), "BAC");
assert.equal(order(applyOp(base, { op: "move", kind: "slot", id: "C", target: { windowId: "am", index: 0 }, copy: false }, newId), "am"), "CAB");

// Move to another window; copy keeps the source.
const moved = applyOp(base, { op: "move", kind: "slot", id: "B", target: { windowId: "pm", index: 0 }, copy: false }, newId);
assert.equal(order(moved, "am"), "AC");
assert.equal(order(moved, "pm"), "B");
const copied = applyOp(base, { op: "move", kind: "slot", id: "B", target: { windowId: "pm", index: 0 }, copy: true }, newId);
assert.equal(order(copied, "am"), "ABC");
assert.equal(copied.blocks.length, 6);

// Fixed window rejects drops.
assert.throws(() => applyOp(base, { op: "move", kind: "slot", id: "A", target: { windowId: "lunch", index: 0 }, copy: false }, newId));

// Branch out of a parallel slot into a gap: new slot with the source duration.
const split = applyOp(base, { op: "move", kind: "block", id: "b2", target: { windowId: "am", index: 3 }, copy: false }, newId);
const newSlot = split.slots.find((s) => !"ABC".includes(s.id))!;
assert.equal(order(split, "am"), "ABC" + newSlot.id);
assert.equal(newSlot.durationMin, 90);

// Only branch onto another slot: source slot disappears, branch appended.
const merged = applyOp(base, { op: "move", kind: "block", id: "a1", target: { slotId: "C" }, copy: false }, newId);
assert.equal(order(merged, "am"), "BC");
assert.deepEqual(merged.blocks.filter((b) => b.slotId === "C").sort((x, y) => x.branchOrder - y.branchOrder).map((b) => b.id), ["c1", "a1"]);

// Whole slot onto a slot: branches join, source removed.
const joined = applyOp(base, { op: "move", kind: "slot", id: "B", target: { slotId: "A" }, copy: false }, newId);
assert.deepEqual(joined.blocks.filter((b) => b.slotId === "A").map((b) => b.branchOrder).sort(), [0, 1, 2]);
assert.equal(order(joined, "am"), "AC");

// Insert, resize clamp, delete last branch removes the slot.
const ins = applyOp(base, { op: "insert", target: { windowId: "am", index: 1 }, durationMin: 15, block: { ...blk("x", "x", 0) } }, newId);
assert.equal(ins.slots.filter((s) => s.windowId === "am").length, 4);
assert.equal(order(ins, "am").replace(/new\d+/, "X"), "AXBC");
assert.equal(applyOp(base, { op: "resize", slotId: "A", durationMin: 2 }, newId).slots.find((s) => s.id === "A")!.durationMin, 5);
assert.equal(order(applyOp(base, { op: "deleteBlock", blockId: "a1" }, newId), "am"), "BC");

// User UI prefs: unknown keys dropped, numbers clamped, wrong types ignored.
assert.deepEqual(
  sanitizeUiPrefs({ planningLibraryWidth: 9999, planningCardDescriptionChars: 3, planningCardShowMeta: false, planningCardShowGroups: "yes", evil: 1 }),
  { planningLibraryWidth: 640, planningCardDescriptionChars: 10, planningCardShowMeta: false }
);

// Sheet model: title+header rows, days and parallel times merged, organisation
// rows tinted with their category color, leader cells with the leader color,
// one minutes column per analysed main category.
{
  const r = (activity: string, extra: Record<string, unknown> = {}) =>
    ({ activity, description: "", leader: "", leaderId: null, location: "", groups: "", secondaryCategory: "", notes: "", categoryMinutes: {}, mainCategoryIds: [], ...extra }) as never;
  const model = buildSheetModel(
    {
      eventName: "Tábor",
      days: [{ id: "d", label: "Den 1", date: null, theme: null, windows: [{ name: "w", start: "", end: "", slots: [
        { start: "08:00", end: "08:30", startMin: 0, durationMin: 30, branches: [r("Snídaně", { mainCategoryIds: ["org"] })] },
        { start: "09:00", end: "10:00", startMin: 0, durationMin: 60, branches: [
          r("A", { leader: "Tom", leaderId: "tom", mainCategoryIds: ["t"], categoryMinutes: { t: 60 } }),
          r("B", { mainCategoryIds: ["t", "p"], categoryMinutes: { t: 20, p: 40 } }),
        ] },
      ] }] }],
      categories: [
        { id: "t", name: "Teorie", color: "#0000ff", group: "primary", counted: true },
        { id: "p", name: "Praxe", color: "#00ff00", group: "primary", counted: true },
        { id: "org", name: "Org", color: "#ff0000", group: "primary", counted: false },
      ],
      leaderColors: { tom: "#000000" },
    },
    { ...DEFAULT_SHEET_STYLE, showDescription: false, showLocation: false, zebra: false }
  );
  assert.deepEqual(model.rows[1].map((c) => c.v), ["Den", "Čas", "Aktivita", "Vedoucí", "Teorie", "Praxe"]);
  assert.deepEqual(model.rows.slice(2).map((row) => row.slice(1).map((c) => c.v)), [
    ["08:00–08:30", "Snídaně", "", "", ""],
    ["09:00–10:00", "A", "Tom", 60, ""],
    ["09:00–10:00", "B", "", 20, 40],
  ]);
  assert.deepEqual(model.merges.slice(1), [{ row: 3, col: 1, rows: 2, cols: 1 }, { row: 2, col: 0, rows: 3, cols: 1 }]);
  assert.equal(model.rows[2][2].bg, tint("#ff0000", 0.55)); // organisation row
  assert.equal(model.rows[3][3].bg, tint("#000000", 0.45)); // leader cell
  assert.equal(model.rows[3][2].bg, undefined);
  assert.deepEqual(sanitizeSheetStyle({ fontSize: 99, titleBg: "red", zebra: "x", headerBg: "#ABCDEF" }).fontSize, 14);
  assert.equal(sanitizeSheetStyle({ titleBg: "red", headerBg: "#ABCDEF" }).titleBg, DEFAULT_SHEET_STYLE.titleBg);
  assert.equal(sanitizeSheetStyle({ headerBg: "#ABCDEF" }).headerBg, "#abcdef");
}

// Input state is never mutated.
assert.equal(order(base, "am"), "ABC");
console.log("planning.check: ok");
