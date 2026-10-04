"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { copyFamilyLink, familyTarget, portalComposeHref } from "@/components/children/portal-link";

// Rodiny on the Lidé page (docs/registration-slice3-spec.md B): proposed
// families (people sharing a guardian e-mail -- created only on "Vytvořit"),
// the families with their members and contacts, edit (rename, add/remove,
// merge, dissolve) and the family portal link tools.
type Member = { id: string; name: string; isAdult: boolean; dateOfBirth: string | null };
type Contact = { name: string | null; email: string; phone: string | null; member: string | null };
type Family = { id: string; name: string; hasPortalLink: boolean; members: Member[]; contacts: Contact[] };
type Duplicate = Member & { sameName: boolean };
type Data = {
  families: Family[];
  suggestions: { name: string; members: Member[] }[];
  review: { id: string; name: string; members: (Member & { duplicates: Duplicate[] })[] }[];
};
export type FamilyPerson = { id: string; name: string; dateOfBirth: string | null; familyId: string | null };

const inputClassSm = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const personLabel = (c: { name: string; dateOfBirth: string | null }) => `${c.name} (${date(c.dateOfBirth)})`;

export default function Families({ people, match, onChanged }: { people: FamilyPerson[]; match: (name: string) => boolean; onChanged: () => void }) {
  const { t } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [addPick, setAddPick] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/families");
    if (res.ok) setData(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function post(body: object): Promise<Response | null> {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/families", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage(t("children.errorFailed"));
      return null;
    }
    await load();
    onChanged();
    return res;
  }

  // A public-form person is the same as an existing one: keep the existing
  // profile, move the registration over (the usual merge).
  async function mergeInto(member: Member, existing: Member) {
    if (!(await confirm({ message: t("families.reviewMergeConfirm", { name: member.name, existing: existing.name }) }))) return;
    setBusy(true);
    const res = await fetch("/api/children", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", keepId: existing.id, mergeIds: [member.id] }) }).catch(() => null);
    setBusy(false);
    setMessage(res?.ok ? null : t("children.errorFailed"));
    await load();
    onChanged();
  }

  async function copy(f: Family) {
    const ok = await copyFamilyLink(f.id);
    setMessage(ok ? t("childProfile.linkCopied", { name: f.name }) : t("children.errorFailed"));
    if (ok && !f.hasPortalLink) load();
  }

  async function newLink(f: Family) {
    if (!(await confirm({ message: t("childProfile.newLinkConfirm"), danger: true }))) return;
    if (await post({ action: "token", familyId: f.id, regenerate: true })) setMessage(t("childProfile.newLinkDone"));
  }

  async function add(f: Family) {
    const person = people.find((p) => !p.familyId && personLabel(p) === addPick[f.id]);
    if (!person) return setMessage(t("children.pickFromList"));
    if (await post({ action: "add", familyId: f.id, childId: person.id })) setAddPick((p) => ({ ...p, [f.id]: "" }));
  }

  if (!data) return null;
  const loose = people.filter((p) => !p.familyId);
  const families = data.families.filter((f) => match(f.name) || f.members.some((m) => match(m.name)));
  const suggestions = data.suggestions.filter((s) => s.members.some((m) => match(m.name)));

  return (
    <div className="flex flex-col gap-8">
      {message && <p className="text-[13px] text-ink">{message}</p>}
      {data.review.length > 0 && (
        <section>
          <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("families.reviewTitle", { count: String(data.review.length) })}</h2>
          <p className="mb-2 text-[12.5px] text-ink-secondary">{t("families.reviewHint")}</p>
          <div className="flex flex-col gap-2">
            {data.review.map((f) => (
              <div key={f.id} className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-ink">{f.name}</span>
                  <button disabled={busy} onClick={() => post({ action: "reviewed", familyId: f.id })} className={btn}>
                    {t("families.reviewed")}
                  </button>
                </div>
                {f.members.map((m) => (
                  <div key={m.id} className="text-[13px]">
                    <a href={`/children/${m.id}`} className="text-ink underline hover:text-ember">
                      {personLabel(m)}
                    </a>
                    {m.duplicates.map((d) => (
                      <div key={d.id} className="ml-4 flex flex-wrap items-center gap-2 text-ink-secondary">
                        <span>
                          {t(d.sameName ? "families.dupSameName" : "families.dupSameEmail")}:{" "}
                          <a href={`/children/${d.id}`} className="underline hover:text-ember">
                            {personLabel(d)}
                          </a>
                        </span>
                        <button disabled={busy} onClick={() => mergeInto(m, d)} className="text-ember hover:underline">
                          {t("families.reviewMerge")}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("families.suggestedTitle", { count: String(suggestions.length) })}</h2>
          <p className="mb-2 text-[12.5px] text-ink-secondary">{t("families.suggestedHint")}</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => {
              const key = s.members.map((m) => m.id).join(",");
              const name = names[key] ?? s.name;
              return (
                <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-mist p-2">
                  <input value={name} onChange={(e) => setNames((p) => ({ ...p, [key]: e.target.value }))} aria-label={t("families.name")} className={inputClassSm + " w-44"} />
                  <span className="flex-1 text-[13px] text-ink">{s.members.map((m) => m.name).join(", ")}</span>
                  <button disabled={busy || !name.trim()} onClick={() => post({ action: "create", name, childIds: s.members.map((m) => m.id) })} className={btn}>
                    {t("families.create")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("families.title", { count: String(data.families.length) })}</h2>
        <datalist id="family-people">
          {loose.map((p) => (
            <option key={p.id} value={personLabel(p)} />
          ))}
        </datalist>
        {families.length === 0 ? (
          <p className="text-[13px] text-ink-secondary">{t("families.empty")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {families.map((f) => (
              <div key={f.id} className="flex flex-col gap-2 rounded-lg border border-mist p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={f.name}
                    aria-label={t("families.name")}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.name && post({ action: "rename", familyId: f.id, name: e.target.value })}
                    className={inputClassSm + " min-w-0 flex-1 font-medium"}
                  />
                  <button
                    disabled={busy}
                    onClick={async () => (await confirm({ message: t("families.deleteConfirm", { name: f.name }), danger: true })) && post({ action: "delete", familyId: f.id })}
                    className="text-[12px] text-ink-secondary hover:text-red-600"
                  >
                    {t("families.dissolve")}
                  </button>
                </div>
                <ul className="flex flex-col gap-0.5 text-[13px]">
                  {f.members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <a href={`/children/${m.id}`} className="text-ink underline hover:text-ember">
                        {m.name}
                      </a>
                      <span className="text-[12px] text-ink-secondary">{m.isAdult ? t("people.adult") : date(m.dateOfBirth)}</span>
                      <button disabled={busy} onClick={() => post({ action: "remove", childId: m.id })} title={t("families.removeMember")} aria-label={t("families.removeMember")} className="text-ink-secondary hover:text-red-600">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {f.contacts.length > 0 && (
                  <p className="text-[12px] text-ink-secondary [overflow-wrap:anywhere]">
                    {t("families.contacts")}: {f.contacts.map((c) => (c.member ? `${c.member} (${c.email})` : c.name ? `${c.name} (${c.email})` : c.email)).join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    list="family-people"
                    value={addPick[f.id] ?? ""}
                    onChange={(e) => setAddPick((p) => ({ ...p, [f.id]: e.target.value }))}
                    placeholder={t("families.addPlaceholder")}
                    className={inputClassSm + " w-48"}
                  />
                  <button disabled={busy} onClick={() => add(f)} className={btn}>
                    {t("portalSettings.add")}
                  </button>
                  {data.families.length > 1 && (
                    <select
                      value=""
                      disabled={busy}
                      onChange={async (e) => {
                        const other = data.families.find((o) => o.id === e.target.value);
                        if (other && (await confirm({ message: t("families.mergeConfirm", { other: other.name, name: f.name }) }))) post({ action: "merge", keepId: f.id, mergeIds: [other.id] });
                      }}
                      className={inputClassSm}
                    >
                      <option value="">{t("families.mergeInto")}</option>
                      {data.families
                        .filter((o) => o.id !== f.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-[13px]">
                  <button onClick={() => copy(f)} className="text-ember hover:underline">
                    {t("childProfile.copyLink")}
                  </button>
                  {f.hasPortalLink && (
                    <button onClick={() => newLink(f)} disabled={busy} className="text-ink-secondary hover:text-ink">
                      {t("childProfile.newLink")}
                    </button>
                  )}
                  <button onClick={() => router.push(portalComposeHref([familyTarget(f.id)]))} className="text-ink-secondary hover:text-ink">
                    {t("childProfile.sendLinkShort")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
