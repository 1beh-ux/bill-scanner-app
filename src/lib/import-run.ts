// Fields Manager phase 4 (design §9): an import run's profile writes (through writeTargets) and its undo.
// Every write is kept in ImportRun.writes; undo puts back the "before" value only where the value is still what the
// import wrote -- anything changed since (by a parent, an admin, a later import) is left alone and counted.
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { writeTargets } from "@/lib/field-write-targets";
import { ageOptionSwap } from "@/lib/registration-fields";
import { deleteParticipantCascade } from "@/lib/participant-delete";
import { fieldMode, type ImportPolicy } from "@/lib/participant-sync";
import type { ImportWrite } from "@/lib/participant-sync-run";

type Values = Record<string, unknown>;

/** A values map with `key` set back to `before` (null = removed) if it still holds `after`. Pure. */
export function restoreKey(map: Values | null, key: string, before: unknown, after: unknown): Values | null {
  const now = map ?? {};
  if ((now[key] ?? null) !== (after ?? null)) return null;
  const { [key]: _drop, ...rest } = now;
  return before === null || before === undefined ? rest : { ...rest, [key]: before };
}

/**
 * Profile half of an import: values the import wrote onto linked participants go to the person's profile too, when
 * writeTargets says so (template field stored on the profile). keep = only an empty profile value is filled.
 */
export async function writeProfileValues(organizationId: string, writes: ImportWrite[], policy: ImportPolicy): Promise<ImportWrite[]> {
  const out = await writeProfileValuesRaw(organizationId, writes, policy);
  // 2026-11-26: a value of the other age group's options (Muž for a child, Chlapec for an adult) -> this person's.
  const ids = [...new Set(writes.filter((w) => w.table === "participant").map((w) => w.id))];
  await fixAgeOptions(organizationId, ids);
  return out;
}

/**
 * Select fields with separate options for children and adults: on the given participants and their people, a value
 * of the other group's list becomes the option at the same position in theirs (registration-fields.ts ageOptionSwap).
 */
export async function fixAgeOptions(organizationId: string, participantIds: string[]): Promise<number> {
  if (!participantIds.length) return 0;
  const split = (await prisma.participantFieldTemplate.findMany({ where: { organizationId }, select: { key: true, options: true, adultOptions: true } })).filter(
    (t) => Array.isArray(t.adultOptions) && t.adultOptions.length > 0,
  );
  if (!split.length) return 0;
  const fix = (values: Values, isAdult: boolean) => {
    let changed = false;
    const next = { ...values };
    for (const t of split) {
      const v = next[t.key];
      const swapped = typeof v === "string" ? ageOptionSwap(t, v, isAdult) : null;
      if (swapped) {
        next[t.key] = swapped;
        changed = true;
      }
    }
    return changed ? next : null;
  };
  let n = 0;
  const ps = await prisma.participant.findMany({ where: { id: { in: participantIds } }, select: { id: true, isAdult: true, customFieldValues: true, child: { select: { id: true, isAdult: true, fieldValues: true } } } });
  for (const p of ps) {
    const adult = p.child?.isAdult ?? !!p.isAdult;
    const reg = fix((p.customFieldValues as Values | null) ?? {}, adult);
    if (reg) {
      await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: reg as Prisma.InputJsonValue } });
      n++;
    }
    const prof = p.child && fix((p.child.fieldValues as Values | null) ?? {}, adult);
    if (p.child && prof) {
      await prisma.child.update({ where: { id: p.child.id }, data: { fieldValues: prof as Prisma.InputJsonValue } });
      n++;
    }
  }
  return n;
}

async function writeProfileValuesRaw(organizationId: string, writes: ImportWrite[], policy: ImportPolicy): Promise<ImportWrite[]> {
  const created = new Set(writes.filter((w) => w.table === "participant" && !w.key).map((w) => w.id));
  const changed = new Map<string, Set<string>>();
  for (const w of writes) if (w.table === "participant" && w.key?.startsWith("cf:")) changed.set(w.id, (changed.get(w.id) ?? new Set()).add(w.key.slice(3)));
  const ids = [...new Set([...created, ...changed.keys()])];
  if (!ids.length) return [];
  const [templates, participants] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { organizationId, active: true }, select: { key: true, storage: true, section: true } }),
    prisma.participant.findMany({ where: { id: { in: ids }, childId: { not: null } }, select: { id: true, childId: true, customFieldValues: true } }),
  ]);
  const tpl = new Map(templates.map((t) => [t.key, t]));
  const out: ImportWrite[] = [];
  for (const p of participants) {
    const values = (p.customFieldValues as Values | null) ?? {};
    const keys = created.has(p.id) ? Object.keys(values) : [...(changed.get(p.id) ?? [])];
    const child = await prisma.child.findUniqueOrThrow({ where: { id: p.childId! }, select: { fieldValues: true } });
    const profile = { ...((child.fieldValues as Values | null) ?? {}) };
    let dirty = false;
    for (const key of keys) {
      const t = tpl.get(key);
      if (!t || writeTargets({ fromTemplate: true, storage: t.storage }, { source: "import" }).profile !== "write") continue;
      const v = values[key];
      const keep = fieldMode(policy, p.id, key, t.section) === "keep";
      if (v === undefined || v === "" || profile[key] === v || (keep && profile[key])) continue;
      out.push({ table: "child", id: p.childId!, key: `cf:${key}`, before: profile[key] ?? null, after: v });
      profile[key] = v;
      dirty = true;
    }
    if (dirty) await prisma.child.update({ where: { id: p.childId! }, data: { fieldValues: profile as Prisma.InputJsonValue } });
  }
  return out;
}

/** People (Lidé) the run's linking created for its new participants -- so undo can remove them again. */
export async function createdPeople(writes: ImportWrite[], since: Date): Promise<ImportWrite[]> {
  const ids = writes.filter((w) => w.table === "participant" && !w.key).map((w) => w.id);
  if (!ids.length) return [];
  const ps = await prisma.participant.findMany({ where: { id: { in: ids }, child: { createdAt: { gte: since } } }, select: { childId: true } });
  return [...new Set(ps.map((p) => p.childId!))].map((id) => ({ table: "child" as const, id }));
}

export const recordImportRun = (eventId: string, syncId: string | null, userId: string | null, writes: ImportWrite[]) =>
  prisma.importRun.create({ data: { eventId, syncId, createdById: userId, writes: writes as unknown as Prisma.InputJsonValue }, select: { id: true } });

const PARTICIPANT_PROPS = new Set(["name", "firstName", "lastName", "groupName", "dateOfBirth"]);
const GUARDIAN_PROPS = new Set(["name", "phone", "relationship"]);

/** Undo one run, newest write first. Returns how many writes were undone and how many were left (changed since). */
export async function undoImportRun(eventId: string, runId: string): Promise<{ undone: number; kept: number } | { error: "not_found" | "already_undone" }> {
  const run = await prisma.importRun.findFirst({ where: { id: runId, eventId } });
  if (!run) return { error: "not_found" };
  if (run.undoneAt) return { error: "already_undone" };
  // Claim the run first so two clicks can't undo it twice.
  const claimed = await prisma.importRun.updateMany({ where: { id: runId, undoneAt: null }, data: { undoneAt: new Date() } });
  if (!claimed.count) return { error: "already_undone" };
  let undone = 0;
  let kept = 0;
  const count = (ok: boolean) => (ok ? undone++ : kept++);
  const writes = run.writes as ImportWrite[];
  // People created by the run go last: only once their participations are gone.
  for (const w of [...writes.filter((x) => !(x.table === "child" && !x.key)).reverse(), ...writes.filter((x) => x.table === "child" && !x.key)]) {
    if (w.table === "child" && !w.key) {
      // Like Lidé -> Smazat: only a person with no registrations and no documents (guardians etc. cascade).
      const c = await prisma.child.findUnique({ where: { id: w.id }, select: { familyId: true, _count: { select: { participants: true, documents: true } } } });
      const free = c && c._count.participants === 0 && c._count.documents === 0;
      if (free) {
        await prisma.child.delete({ where: { id: w.id } });
        if (c.familyId) await prisma.family.deleteMany({ where: { id: c.familyId, members: { none: {} } } });
      }
      count(!!free);
    } else if (w.table === "document") {
      count((await prisma.participantDocument.deleteMany({ where: { id: w.id, receivedVia: "sheet", gcsPath: null } })).count > 0);
    } else if (w.table === "guardian" && !w.key) {
      const used = await prisma.parentEmailLog.count({ where: { guardianId: w.id } });
      count(!used && (await prisma.participantGuardian.deleteMany({ where: { id: w.id } })).count > 0);
    } else if (w.table === "guardian" && w.key === "extra") {
      // Own guardian fields (2026-11-26): back to the values before, when nothing changed them since.
      const now = await prisma.participantGuardian.findUnique({ where: { id: w.id }, select: { extra: true } });
      const same = now && JSON.stringify(now.extra ?? null) === JSON.stringify(w.after ?? null);
      if (same) await prisma.participantGuardian.update({ where: { id: w.id }, data: { extra: (w.before ?? undefined) as never } });
      count(!!same);
    } else if (w.table === "guardian" && w.key && GUARDIAN_PROPS.has(w.key)) {
      count((await prisma.participantGuardian.updateMany({ where: { id: w.id, [w.key]: w.after as string }, data: { [w.key]: w.before as string | null } })).count > 0);
    } else if (w.table === "participant" && !w.key) {
      // A person the import created goes only while nothing else hangs on them (mail sent, payment, incident, documents).
      const p = await prisma.participant.findUnique({ where: { id: w.id }, select: { _count: { select: { emailLogs: true, documents: true, incidents: true, bankMovements: true, parentQuestions: true, mealAbsences: true, medPlans: true, medChecklist: true } } } });
      const free = p && Object.values(p._count).every((n) => n === 0);
      if (free) await deleteParticipantCascade(w.id);
      count(!!free);
    } else if (w.table === "participant" && w.key && PARTICIPANT_PROPS.has(w.key)) {
      const toDb = (v: unknown) => (w.key === "dateOfBirth" && typeof v === "string" ? new Date(v) : v) as string | Date | null;
      count((await prisma.participant.updateMany({ where: { id: w.id, [w.key]: toDb(w.after) }, data: { [w.key]: toDb(w.before) } })).count > 0);
    } else if ((w.table === "participant" || w.table === "child") && w.key?.startsWith("cf:")) {
      count(await restoreJson(w.table, w.id, w.key.slice(3), w.before, w.after));
    } else kept++;
  }
  return { undone, kept };
}

async function restoreJson(table: "participant" | "child", id: string, key: string, before: unknown, after: unknown): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (table === "participant") {
      const row = await tx.participant.findUnique({ where: { id }, select: { customFieldValues: true } });
      const next = row && restoreKey(row.customFieldValues as Values | null, key, before, after);
      if (next) await tx.participant.update({ where: { id }, data: { customFieldValues: next as Prisma.InputJsonValue } });
      return !!next;
    }
    const row = await tx.child.findUnique({ where: { id }, select: { fieldValues: true } });
    const next = row && restoreKey(row.fieldValues as Values | null, key, before, after);
    if (next) await tx.child.update({ where: { id }, data: { fieldValues: next as Prisma.InputJsonValue } });
    return !!next;
  });
}
