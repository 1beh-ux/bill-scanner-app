// Planning import -- the server half: resolve names against the event, report
// problems per row, and (unless dryRun) write everything in one transaction.
// The preview is a dry run of this same function, so what it reports is what
// the import does. Rows with errors are skipped; warnings don't block.

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { MIN_SLOT_MINUTES, readCategoryShares, type PlanImportTarget } from "@/lib/planning";
import {
  fold,
  layoutDay,
  parseBool,
  parseDate,
  parseDuration,
  parseCategoryList,
  parseGroupNames,
  parseTimeOfDay,
  parseTimeRange,
} from "@/lib/planning-import";

export type ImportRecord = Record<string, string>;
export type ImportOptions = { mode: "replace" | "append"; createMissing: boolean };
// row = index into the submitted records; code -> planImport.issue.<code>
export type ImportIssue = { row: number; code: string; value?: string };
export type ImportResult = { counts: Record<string, number>; errors: ImportIssue[]; warnings: ImportIssue[] };

type Tx = Prisma.TransactionClient;
type ListKind = "plan_category" | "plan_leader" | "plan_location";
const LIST_KIND: Record<"leaders" | "locations" | "categories", ListKind> = {
  leaders: "plan_leader",
  locations: "plan_location",
  categories: "plan_category",
};
const DAY_MS = 24 * 60 * 60 * 1000;

const COLOR_NAMES: Record<string, string> = {
  cervena: "#ef4444", oranzova: "#f97316", zluta: "#eab308", zelena: "#22c55e", modra: "#3b82f6",
  fialova: "#a855f7", ruzova: "#ec4899", seda: "#9ca3af", hneda: "#92400e", cerna: "#1f2937", tyrkysova: "#14b8a6",
  red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", blue: "#3b82f6", purple: "#a855f7",
  pink: "#ec4899", gray: "#9ca3af", grey: "#9ca3af", brown: "#92400e", black: "#1f2937", teal: "#14b8a6",
};
const parseColor = (raw: string) => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw.trim()) ? raw.trim() : COLOR_NAMES[fold(raw)] ?? null);
const parseGroup = (raw: string) => {
  const s = fold(raw);
  return /^(hlav|prim|1)/.test(s) ? "primary" : /^(vedl|sec|2)/.test(s) ? "secondary" : null;
};
const parseEnergy = (raw: string) => {
  const s = fold(raw);
  return /^(nizk|low|1)/.test(s) ? "low" : /^(stred|med|2)/.test(s) ? "medium" : /^(vysok|high|3)/.test(s) ? "high" : null;
};
const parseCount = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);
const parsePercent = (raw: string) => {
  const n = Number(raw.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export async function runImport(
  eventId: string,
  target: PlanImportTarget,
  records: ImportRecord[],
  options: ImportOptions,
  dryRun: boolean
): Promise<ImportResult> {
  const counts: Record<string, number> = {};
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const bump = (key: string, by = 1) => (counts[key] = (counts[key] ?? 0) + by);
  const get = (r: ImportRecord, key: string) => (r[key] ?? "").trim();

  const [event, listItems, activities] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true } }),
    prisma.eventListItem.findMany({
      where: { eventId, kind: { in: ["plan_category", "plan_leader", "plan_location"] } },
      select: { id: true, kind: true, name: true, data: true },
    }),
    prisma.planActivity.findMany({ where: { eventId } }),
  ]);

  // ---- name resolution, shared by all targets -------------------------------
  // Existing items by folded name; names still to be created are collected and
  // get real ids inside the transaction (`ids` is filled before blocks are built).
  const known = new Map<string, string>(listItems.map((i) => [`${i.kind}:${fold(i.name)}`, i.id]));
  const toCreate = new Map<string, { kind: ListKind; name: string; data?: Prisma.InputJsonValue }>();
  function ref(kind: ListKind, raw: string, row: number, data?: Prisma.InputJsonValue): string | null {
    if (!raw) return null;
    const key = `${kind}:${fold(raw)}`;
    if (known.has(key) || toCreate.has(key)) return key;
    if (!options.createMissing) {
      warnings.push({ row, code: `unknown_${kind}`, value: raw });
      return null;
    }
    toCreate.set(key, { kind, name: raw, data });
    return key;
  }
  const activityByName = new Map(activities.map((a) => [fold(a.name), a]));

  async function createMissingLists(tx: Tx) {
    for (const [key, item] of toCreate) {
      const created = await tx.eventListItem.create({ data: { eventId, kind: item.kind, name: item.name, data: item.data } });
      known.set(key, created.id);
    }
  }
  const idOf = (key: string | null) => (key ? known.get(key) ?? null : null);
  // Category cells ("Teorie 10, Praxe 20") from the primary/secondary columns ->
  // list keys + minutes; resolved to {categoryId, minutes} at write time.
  type CatRef = { key: string; minutes: number | null };
  const categoryRefs = (r: ImportRecord, row: number): CatRef[] =>
    (["primary", "secondary"] as const).flatMap((group) =>
      parseCategoryList(get(r, `${group}Category`)).flatMap(({ name, minutes }) => {
        const key = ref("plan_category", name, row, { group });
        return key ? [{ key, minutes }] : [];
      })
    );
  const resolveCategories = (refs: CatRef[]) =>
    refs.flatMap((c) => (idOf(c.key) ? [{ categoryId: idOf(c.key)!, minutes: c.minutes }] : []));
  const countCreatedLists = () => {
    for (const item of toCreate.values()) bump(`${item.kind}Created`);
  };

  // ---- lists: leaders / locations / categories --------------------------------
  if (target === "leaders" || target === "locations" || target === "categories") {
    const kind = LIST_KIND[target];
    const rows = new Map<string, { name: string; data: Record<string, unknown>; row: number }>();
    records.forEach((r, row) => {
      const name = get(r, "name");
      if (!name) return errors.push({ row, code: "name_required" });
      const data: Record<string, unknown> = {};
      for (const key of ["role", "phone", "notes"]) if (get(r, key)) data[key] = get(r, key);
      if (get(r, "capacity")) {
        const n = parseCount(get(r, "capacity"));
        if (n === null) warnings.push({ row, code: "invalid_number", value: get(r, "capacity") });
        else data.capacity = n;
      }
      if (get(r, "group")) {
        const g = parseGroup(get(r, "group"));
        if (!g) warnings.push({ row, code: "invalid_group", value: get(r, "group") });
        else data.group = g;
      }
      if (get(r, "color")) {
        const c = parseColor(get(r, "color"));
        if (!c) warnings.push({ row, code: "invalid_color", value: get(r, "color") });
        else data.color = c;
      }
      if (get(r, "countInAnalysis")) {
        const b = parseBool(get(r, "countInAnalysis"));
        if (b === null) warnings.push({ row, code: "invalid_bool", value: get(r, "countInAnalysis") });
        else data.countInAnalysis = b;
      }
      if (get(r, "targetPercent")) {
        const p = parsePercent(get(r, "targetPercent"));
        if (p === null) warnings.push({ row, code: "invalid_number", value: get(r, "targetPercent") });
        else data.targetPercent = p;
      }
      const key = fold(name);
      rows.set(key, { name, data: { ...rows.get(key)?.data, ...data }, row });
    });

    const existing = new Map(listItems.filter((i) => i.kind === kind).map((i) => [fold(i.name), i]));
    for (const key of rows.keys()) bump(existing.has(key) ? "updated" : "created");
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        for (const [key, r] of rows) {
          const e = existing.get(key);
          if (e) await tx.eventListItem.update({ where: { id: e.id }, data: { data: { ...((e.data as object) ?? {}), ...r.data } as Prisma.InputJsonValue } });
          else await tx.eventListItem.create({ data: { eventId, kind, name: r.name, data: r.data as Prisma.InputJsonValue } });
        }
      });
    }
    return { counts, errors, warnings };
  }

  // ---- activity library ---------------------------------------------------------
  if (target === "activities") {
    type Act = { name: string; fields: Record<string, unknown>; refs: Record<string, string | null>; cats?: CatRef[] };
    const rows = new Map<string, Act>();
    records.forEach((r, row) => {
      const name = get(r, "name");
      if (!name) return errors.push({ row, code: "name_required" });
      const fields: Record<string, unknown> = {};
      const refs: Record<string, string | null> = {};
      if (get(r, "duration")) {
        const d = parseDuration(get(r, "duration"));
        if (d === null || d < MIN_SLOT_MINUTES) warnings.push({ row, code: "invalid_duration", value: get(r, "duration") });
        else fields.defaultDurationMin = d;
      }
      if (get(r, "description")) fields.description = get(r, "description");
      if (get(r, "energy")) {
        const e = parseEnergy(get(r, "energy"));
        if (!e) warnings.push({ row, code: "invalid_energy", value: get(r, "energy") });
        else fields.energyLevel = e;
      }
      if (get(r, "repeatable")) {
        const b = parseBool(get(r, "repeatable"));
        if (b === null) warnings.push({ row, code: "invalid_bool", value: get(r, "repeatable") });
        else fields.repeatable = b;
      }
      const cats = get(r, "primaryCategory") || get(r, "secondaryCategory") ? categoryRefs(r, row) : undefined;
      if (get(r, "leader")) refs.defaultLeaderId = ref("plan_leader", get(r, "leader"), row);
      if (get(r, "location")) refs.defaultLocationId = ref("plan_location", get(r, "location"), row);
      const key = fold(name);
      const prev = rows.get(key);
      rows.set(key, { name, fields: { ...prev?.fields, ...fields }, refs: { ...prev?.refs, ...refs }, cats: cats ?? prev?.cats });
    });

    countCreatedLists();
    for (const key of rows.keys()) bump(activityByName.has(key) ? "updated" : "created");
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        await createMissingLists(tx);
        for (const [key, a] of rows) {
          const refs = {
            ...Object.fromEntries(Object.entries(a.refs).map(([k, v]) => [k, idOf(v)])),
            ...(a.cats && { categories: resolveCategories(a.cats) }),
          };
          const e = activityByName.get(key);
          if (e) await tx.planActivity.update({ where: { id: e.id }, data: { ...a.fields, ...refs } });
          else await tx.planActivity.create({ data: { eventId, name: a.name, defaultDurationMin: 30, ...a.fields, ...refs } });
        }
      });
    }
    return { counts, errors, warnings };
  }

  // ---- schedule --------------------------------------------------------------------
  const days = await prisma.planDay.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  const year = event.startDate.getUTCFullYear();
  type Row = {
    index: number;
    start: number;
    end: number;
    windowName?: string;
    dayKey: string;
    activityName: string;
    activityKey: string; // folded name
    refs: Record<string, string | null>; // list keys, resolved to ids at write time
    cats: CatRef[];
    groupNames: string[];
    description: string | null;
    notes: string | null;
  };
  const dayInfo = new Map<string, { date: string | null; label: string | null; existingId: string | null }>();
  const newActivities = new Map<string, { name: string; duration: number }>();
  const rows: Row[] = [];

  records.forEach((r, index) => {
    const dayRaw = get(r, "date");
    const activityName = get(r, "activity");
    if (!dayRaw) return errors.push({ row: index, code: "day_required" });
    if (!activityName) return errors.push({ row: index, code: "activity_required" });

    // Day: a date, else a label ("Den 1") matched against existing days.
    const date = parseDate(dayRaw, year);
    const dayKey = date ? `d:${date}` : `l:${fold(dayRaw)}`;

    // Time: a range column, or start + end/duration (falling back to the activity's default length).
    let start: number | null = null;
    let end: number | null = null;
    const range = get(r, "time") ? parseTimeRange(get(r, "time")) : null;
    if (range) ({ start, end } = range);
    else if (get(r, "time")) start = parseTimeOfDay(get(r, "time"));
    if (get(r, "start")) start = parseTimeOfDay(get(r, "start"));
    if (get(r, "end")) end = parseTimeOfDay(get(r, "end"));
    const knownActivity = activityByName.get(fold(activityName));
    if (end === null && start !== null) {
      const duration = get(r, "duration") ? parseDuration(get(r, "duration")) : knownActivity?.defaultDurationMin ?? null;
      if (duration !== null) end = start + duration;
    }
    if (start === null) return errors.push({ row: index, code: "invalid_start", value: get(r, "start") || get(r, "time") });
    if (end === null) return errors.push({ row: index, code: "missing_end" });
    if (end - start < MIN_SLOT_MINUTES || end > 24 * 60) return errors.push({ row: index, code: "invalid_end", value: get(r, "end") || get(r, "duration") });

    // Only valid rows touch a day -- a day whose rows all failed is never replaced.
    if (!dayInfo.has(dayKey)) {
      const match = date
        ? days.find((d) => d.date?.toISOString().slice(0, 10) === date)
        : days.find((d) => fold(d.label) === fold(dayRaw));
      dayInfo.set(dayKey, { date, label: date ? null : dayRaw, existingId: match?.id ?? null });
    }
    const activityKey = fold(activityName);
    if (!knownActivity && options.createMissing && !newActivities.has(activityKey)) {
      newActivities.set(activityKey, { name: activityName, duration: end - start });
    }
    const cats = categoryRefs(r, index);
    const refs: Record<string, string | null> = {
      leaderId: get(r, "leader") ? ref("plan_leader", get(r, "leader"), index) : null,
      locationId: get(r, "location") ? ref("plan_location", get(r, "location"), index) : null,
    };
    rows.push({
      index,
      start,
      end,
      windowName: get(r, "window") || undefined,
      dayKey,
      activityName,
      activityKey,
      refs,
      cats,
      groupNames: parseGroupNames(get(r, "groups")),
      description: get(r, "description") || null,
      notes: get(r, "notes") || null,
    });
  });

  // Lay out each day; report parallel rows whose lengths had to be unified.
  const layouts = new Map<string, ReturnType<typeof layoutDay<Row>>>();
  for (const dayKey of dayInfo.keys()) {
    const layout = layoutDay(rows.filter((r) => r.dayKey === dayKey));
    layout.unequal.forEach((g) => g.forEach((r) => warnings.push({ row: r.index, code: "parallel_length_unified" })));
    layouts.set(dayKey, layout);
    const info = dayInfo.get(dayKey)!;
    bump(info.existingId ? (options.mode === "replace" ? "daysReplaced" : "daysAppended") : "daysCreated");
    bump("windowsCreated", layout.windows.length);
    bump("slotsCreated", layout.windows.reduce((n, w) => n + w.slots.length, 0));
  }
  bump("blocksCreated", rows.length);
  bump("activitiesCreated", newActivities.size);
  countCreatedLists();
  if (dryRun || rows.length === 0) return { counts, errors, warnings };

  await prisma.$transaction(
    async (tx) => {
      await createMissingLists(tx);
      const activityIds = new Map(activities.map((a) => [fold(a.name), a]));
      for (const [key, a] of newActivities) {
        const created = await tx.planActivity.create({ data: { eventId, name: a.name, defaultDurationMin: a.duration } });
        activityIds.set(key, created);
      }

      let nextSort = (days.at(-1)?.sortOrder ?? -1) + 1;
      const firstDate = event.startDate.getTime();
      for (const [dayKey, layout] of layouts) {
        const info = dayInfo.get(dayKey)!;
        let dayId = info.existingId;
        if (dayId && options.mode === "replace") await tx.planWindow.deleteMany({ where: { dayId } });
        if (!dayId) {
          const created = await tx.planDay.create({
            data: {
              eventId,
              sortOrder: nextSort,
              date: info.date ? new Date(`${info.date}T00:00:00Z`) : null,
              label: info.label ?? `Den ${info.date ? Math.max(1, Math.round((Date.parse(info.date) - firstDate) / DAY_MS) + 1) : nextSort + 1}`,
            },
          });
          dayId = created.id;
          nextSort++;
        }
        const offset = options.mode === "append" ? await tx.planWindow.count({ where: { dayId } }) : 0;
        for (const [wi, w] of layout.windows.entries()) {
          await tx.planWindow.create({
            data: {
              dayId,
              name: w.name,
              startMin: w.startMin,
              endMin: w.endMin,
              kind: w.kind,
              sortOrder: offset + wi,
              slots: {
                create: w.slots.map((s, position) => ({
                  durationMin: s.durationMin,
                  position,
                  blocks: {
                    create: s.rows.map((r, branchOrder) => {
                      // Row values win; empty cells fall back to the activity's defaults.
                      const a = activityIds.get(r.activityKey);
                      return {
                        branchOrder,
                        activityId: a?.id ?? null,
                        customName: a ? null : r.activityName,
                        description: r.description ?? a?.description ?? null,
                        categories: r.cats.length ? resolveCategories(r.cats) : readCategoryShares(a?.categories),
                        leaderId: idOf(r.refs.leaderId) ?? a?.defaultLeaderId ?? null,
                        locationId: idOf(r.refs.locationId) ?? a?.defaultLocationId ?? null,
                        notes: r.notes,
                        groupNames: r.groupNames,
                      };
                    }),
                  },
                })),
              },
            },
          });
        }
      }

      // Keep days in date order (same rule as editing a day's date).
      const all = await tx.planDay.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" }, select: { id: true, date: true } });
      const sorted = [...all].sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
      for (const [i, d] of sorted.entries()) await tx.planDay.update({ where: { id: d.id }, data: { sortOrder: i } });
    },
    { timeout: 60_000 }
  );
  return { counts, errors, warnings };
}

