"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

type EventRef = { id: string; name: string; startDate: string; kind: "event" | "membership"; membershipYear: number | null };
type ChildRow = {
  id: string;
  name: string;
  dateOfBirth: string | null;
  participants: { id: string; registrationStatus: "pending" | "accepted"; event: EventRef }[];
};
type UnlinkedRow = { id: string; name: string; dateOfBirth: string | null; event: EventRef };
type Data = { children: ChildRow[]; unlinked: UnlinkedRow[]; duplicates: string[][] };

const inputClassSm =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn = "rounded-lg border border-mist px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2";
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—");
const childLabel = (c: ChildRow) => `${c.name} (${date(c.dateOfBirth)})`;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function ChildrenPage() {
  const { t, role, roleLoaded } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState<Record<string, string>>({});

  useEffect(() => {
    if (roleLoaded && role !== "admin") router.replace("/events");
  }, [roleLoaded, role, router]);

  async function load() {
    const res = await fetch("/api/children");
    if (res.ok) setData(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function post(body: object) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/children", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setMessage(t("children.errorFailed"));
      return null;
    }
    await load();
    return res.json();
  }

  async function seed() {
    const r = await post({ action: "seed" });
    if (r) setMessage(t("children.seedDone", { linked: String(r.linked), created: String(r.created) }));
  }

  async function merge(keep: ChildRow, others: ChildRow[]) {
    const ok = await confirm({ message: t("children.mergeConfirm", { name: childLabel(keep), count: String(others.length) }) });
    if (ok) await post({ action: "merge", keepId: keep.id, mergeIds: others.map((c) => c.id) });
  }

  async function link(p: UnlinkedRow) {
    const label = linkInput[p.id] ?? "";
    const child = data?.children.find((c) => childLabel(c) === label);
    if (!child) {
      setMessage(t("children.pickFromList"));
      return;
    }
    await post({ action: "link", participantId: p.id, childId: child.id });
  }

  const byId = useMemo(() => new Map((data?.children ?? []).map((c) => [c.id, c])), [data]);
  const q = fold(query.trim());
  const match = (name: string) => !q || fold(name).includes(q);

  if (!roleLoaded || role !== "admin") return null;

  const eventChip = (p: ChildRow["participants"][number]) => {
    const membership = p.event.kind === "membership";
    const accepted = p.registrationStatus === "accepted";
    return (
      <span
        key={p.id}
        className={
          "mr-1 mb-1 inline-block rounded px-1.5 py-0.5 text-[12px] " +
          (membership ? (accepted ? "bg-pine-bg text-pine" : "bg-ember/15 text-ink") : "bg-paper-2 text-ink-secondary")
        }
      >
        {membership ? t("children.membershipChip", { year: String(p.event.membershipYear ?? "?") }) : p.event.name}
        {membership && !accepted && ` (${t("children.pending")})`}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-2 text-[22px] font-semibold text-ink">{t("children.title")}</h1>
      <p className="mb-4 max-w-2xl text-[13px] text-ink-secondary">{t("children.intro")}</p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button onClick={seed} disabled={busy} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          {t("children.seedButton")}
        </button>
        <input type="search" placeholder={t("children.search")} value={query} onChange={(e) => setQuery(e.target.value)} className={inputClassSm} />
      </div>
      {message && <p className="mb-4 text-[13px] text-ink">{message}</p>}

      {!data ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {data.duplicates.length > 0 && (
            <section>
              <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("children.duplicatesTitle")}</h2>
              <p className="mb-2 text-[12.5px] text-ink-secondary">{t("children.duplicatesHint")}</p>
              {data.duplicates
                .map((ids) => ids.map((id) => byId.get(id)!).filter(Boolean))
                .filter((group) => group.some((c) => match(c.name)))
                .map((group) => (
                  <div key={group[0].id} className="mb-2 rounded-lg border border-mist p-2">
                    {group.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 py-1">
                        <span className="min-w-48 text-[14px] text-ink">{childLabel(c)}</span>
                        <span className="flex-1">{c.participants.map(eventChip)}</span>
                        <button disabled={busy} onClick={() => merge(c, group.filter((o) => o.id !== c.id))} className={btn}>
                          {t("children.keepThis")}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
            </section>
          )}

          {data.unlinked.length > 0 && (
            <section>
              <h2 className="mb-1 text-[15px] font-semibold text-ink">{t("children.unlinkedTitle", { count: String(data.unlinked.length) })}</h2>
              <p className="mb-2 text-[12.5px] text-ink-secondary">{t("children.unlinkedHint")}</p>
              <datalist id="children-list">
                {data.children.map((c) => (
                  <option key={c.id} value={childLabel(c)} />
                ))}
              </datalist>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <tbody>
                    {data.unlinked
                      .filter((p) => match(p.name))
                      .map((p) => (
                        <tr key={p.id} className="border-b border-mist/60">
                          <td className="p-2 text-[14px] text-ink">{p.name}</td>
                          <td className="p-2 text-[13px] text-ink-secondary">{date(p.dateOfBirth)}</td>
                          <td className="p-2 text-[13px] text-ink-secondary">{p.event.name}</td>
                          <td className="whitespace-nowrap p-2">
                            <input
                              list="children-list"
                              placeholder={t("children.linkPlaceholder")}
                              value={linkInput[p.id] ?? ""}
                              onChange={(e) => setLinkInput({ ...linkInput, [p.id]: e.target.value })}
                              className={inputClassSm + " mr-2 w-56"}
                            />
                            <button disabled={busy} onClick={() => link(p)} className={btn + " mr-2"}>
                              {t("children.link")}
                            </button>
                            <button disabled={busy} onClick={() => post({ action: "link", participantId: p.id, childId: "new" })} className={btn}>
                              {t("children.newChild")}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{t("children.listTitle", { count: String(data.children.length) })}</h2>
            {data.children.length === 0 ? (
              <p className="text-[13px] text-ink-secondary">{t("children.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-mist text-left">
                      <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                      <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("children.colBirth")}</th>
                      <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("children.colEvents")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.children
                      .filter((c) => match(c.name))
                      .map((c) => (
                        <tr key={c.id} className="border-b border-mist/60 align-top">
                          <td className="p-2 text-[14px] text-ink">{c.name}</td>
                          <td className="p-2 text-[13px] text-ink-secondary">{date(c.dateOfBirth)}</td>
                          <td className="p-2">{c.participants.map(eventChip)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
