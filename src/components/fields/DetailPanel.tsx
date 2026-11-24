"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";
import { fieldHints } from "@/lib/field-hints";
import { RECOMMENDED_RULE, readContactRule } from "@/lib/contact-email";
import FieldCard from "./FieldCard";
import { NewFieldForm } from "./FieldEditors";
import { docsUsing, type FmDocTemplate, type FmOverview, type FmVariable, type OvField } from "./types";

// Redesign R7–R14 (2026-11-23): the one right-hand panel of the Fields screen. Whatever is selected -- a field, a
// variable, a source, a place where fields are used -- shows its details here, every property editable in place or
// with a link to the exact place where it is changed, plus the assistant's hints with their one-click fixes.
const input = "rounded border border-mist bg-paper px-2 py-1 text-[13px]";
const USES = ["lists", "health", "mail", "email", "documents", "import"] as const;
// Built-in calculated values: what each one is and where its rules are set (R9).
const BUILTIN_TAB: Record<string, string> = { effective_price: "platba", variable_symbol: "platba", membership_status: "lide", price_category: "platba", details_status: "portal", payment_qr_image: "platba", contact_email: "" };

type Props = { overview: FmOverview; docs: FmDocTemplate[] | null; selected: string | null; creating: boolean; setCreating: (v: boolean) => void; onSelect: (id: string | null) => void; onChanged: () => void; onPatch: (key: string, body: Record<string, unknown>, undo?: Record<string, unknown>) => Promise<boolean>; onOpenTab: (tab: string, extra?: Record<string, string>) => void };

export default function DetailPanel(p: Props) {
  const { t } = useTranslations();
  const [renamed, setRenamed] = useState<{ from: string; to: string; logId: string } | null>(null);
  const id = p.selected;
  const field = id?.startsWith("field:") ? p.overview.fields.find((f) => f.key === id.slice(6)) : undefined;
  const variable = id?.startsWith("var:") ? p.overview.variables.find((v) => v.key === id.slice(4)) : undefined;
  async function undoRename() {
    if (!renamed) return;
    const res = await fetch("/api/fields/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId: renamed.logId }) }).catch(() => null);
    if (res?.ok) {
      p.onSelect(`field:${renamed.from}`);
      setRenamed(null);
      p.onChanged();
    }
  }
  return (
    <div className="space-y-3">
      {renamed && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-pine bg-pine-bg px-3 py-2 text-[13px]">
          <span>{t("fieldsManager.renamedTo", { from: renamed.from, to: renamed.to })}</span>
          <button type="button" onClick={undoRename} className="rounded border border-pine px-2 py-0.5 text-[12px]">{t("fieldsManager.undo")}</button>
        </div>
      )}
      {p.creating ? (
        <NewFieldForm
          overview={p.overview}
          onDone={(k) => {
            p.setCreating(false);
            if (k) {
              p.onSelect(`field:${k}`);
              p.onChanged();
            }
          }}
        />
      ) : field ? (
        <FieldPanel {...p} key={`${field.key}|${field.label}`} field={field} onRenamed={(from, to, logId) => {
          setRenamed({ from, to, logId });
          p.onSelect(`field:${to}`);
          p.onChanged();
        }} />
      ) : variable ? (
        <VariablePanel {...p} key={`${variable.key}|${variable.raw ?? variable.value ?? ""}`} variable={variable} />
      ) : id?.startsWith("src:") ? (
        <SourcePanel {...p} sourceId={id.slice(4)} />
      ) : id?.startsWith("use:") ? (
        <PlacePanel {...p} use={id.slice(4)} />
      ) : (
        <p className="rounded-xl border border-mist bg-paper p-4 text-[13px] text-ink-secondary">{t("fieldsManager.overviewHelp")}</p>
      )}
    </div>
  );
}

function FieldPanel({ overview, docs, field, onChanged, onPatch, onOpenTab, onRenamed }: Props & { field: OvField; onRenamed: (from: string, to: string, logId: string) => void }) {
  const { t } = useTranslations();
  const ticketEvent = overview.variables.some((v) => v.category === "order");
  const [editCalc, setEditCalc] = useState(false);
  const [label, setLabel] = useState(field.label);
  // The form's own fixed question (buyer, note...): what it is and where its wording is changed.
  if (field.kind === "form")
    return (
      <div className="space-y-2 rounded-xl border border-mist bg-paper p-4 text-[13px]">
        <h3 className="text-[15px] font-semibold text-ink">🔒 {field.label}</h3>
        <div className="font-mono text-[12px] text-ink-secondary">{`{{${field.key}}}`}</div>
        <p className="text-ink-secondary">{t(field.key === "is_adult" ? "fieldsManager.formQuestion.isAdult" : ticketEvent ? "fieldsManager.formQuestion.ticket" : "fieldsManager.formQuestion.registration")}</p>
        <Link href={field.key === "is_adult" ? "/children" : `/events/${overview.eventId}?tab=${ticketEvent ? "vstupenky" : "verejna"}`} className="text-ember hover:underline">{t("fieldsManager.panel.changeThere")} ↗</Link>
      </div>
    );
  // An organization field this event doesn't use (yet).
  if (!field.inEvent)
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-mist bg-paper p-4 text-[13px]">
        <h3 className="text-[15px] font-semibold text-ink">{field.label}</h3>
        <div className="font-mono text-[12px] text-ink-secondary">{field.key}</div>
        <p className="text-ink-secondary">{t("fieldsManager.notInEvent")}</p>
        <button type="button" onClick={() => onPatch(field.key, { inEvent: true }, { inEvent: false })} className="rounded-lg bg-ember px-3 py-1 text-white">{t("fieldsManager.useInEvent")}</button>
      </div>
    );
  const hints = fieldHints(field, overview.fields, docs, { contactMissing: overview.contactMissing });
  const enabledFor = (u: string) => (u === "lists" ? field.surfaces.includes("list") : u === "health" ? field.surfaces.some((s) => s.startsWith("health")) : u === "mail" ? field.surfaces.includes("mail_list") : field.surfaces.includes(u));
  const usingDocs = docsUsing(field, docs);
  const custom = field.kind === "custom";
  const box = "rounded-xl border border-mist bg-paper p-3 text-[13px] space-y-2";

  return (
    <div className="space-y-3">
      <FieldCard field={field} overview={overview} docs={docs} onChanged={onChanged} onRenamed={onRenamed} />

      {hints.length > 0 && (
        <section className={box}>
          <h4 className="font-semibold">{t("fieldsManager.hints")}</h4>
          {hints.map((h) => (
            <div key={h.id} className={`flex items-start gap-2 ${h.level === "warn" ? "text-amber-800" : "text-ink-secondary"}`}>
              <span className="flex-1">{t(`fieldsManager.hint.${h.id}`, h.params)}</span>
              {h.fix?.kind === "patch" && (
                <button type="button" onClick={() => onPatch(field.key, (h.fix as { body: Record<string, unknown> }).body)} className="shrink-0 rounded border border-mist px-2 py-0.5 text-[12px] text-ink hover:bg-paper-2">
                  {t("fieldsManager.hintFix")}
                </button>
              )}
              {h.fix?.kind === "tab" && (
                <button type="button" onClick={() => onOpenTab((h.fix as { tab: string }).tab)} className="shrink-0 rounded border border-mist px-2 py-0.5 text-[12px] text-ink hover:bg-paper-2">
                  {t("fieldsManager.hintOpen")}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className={box}>
        <h4 className="font-semibold">{t("fieldsManager.panel.basics")}</h4>
        {field.system && <p className="rounded-lg bg-paper-2 p-2 text-[12px]">🔒 {t("fieldsManager.panel.systemHelp")}</p>}
        {custom || field.fromTemplate ? (
          <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), label.trim() && label !== field.label && onPatch(field.key, { label }, { label: field.label }))}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${input} min-w-0 flex-1`} aria-label={t("fieldsManager.label")} />
            <button disabled={label === field.label} className="rounded border border-mist px-2 hover:bg-paper-2 disabled:opacity-40">{t("fieldsManager.save")}</button>
          </form>
        ) : (
          <p className="text-ink-secondary">{t("fieldsManager.panel.fixedLabel")}</p>
        )}
        {custom && !field.calculated && field.fieldType !== "composite" && field.fieldType !== "image" && <TypeEditor field={field} onPatch={onPatch} />}
        {/* Round 2b: the only place storage shows. Organization fields switch it; a registration value like Skupina is
            shown off, the person's own fixed values (birth date, guardian) on -- both fixed. */}
        {!field.calculated && (
          <label className={`flex items-center gap-2 ${field.fromTemplate ? "" : "text-ink-secondary"}`}>
            <input type="checkbox" disabled={!field.fromTemplate} checked={field.storage !== "event"} onChange={(e) => onPatch(field.key, { storage: e.target.checked ? "profile" : "event" }, { storage: field.storage })} />
            {t("fieldsManager.panel.toProfile")}
            <span className="text-[12px] text-ink-secondary">{t(field.fromTemplate ? "fieldsManager.panel.toProfileHelp" : field.storage === "event" ? "fieldsManager.panel.toProfileNever" : "fieldsManager.panel.toProfileAlways")}</span>
          </label>
        )}
        {field.fromTemplate && !field.system && !field.locked && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={field.active} onChange={(e) => onPatch(field.key, { inEvent: e.target.checked }, { inEvent: !e.target.checked })} />
            {t("fieldsManager.useInEvent")}
          </label>
        )}
        {field.fromTemplate && !field.system && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={field.locked} onChange={(e) => onPatch(field.key, { locked: e.target.checked }, { locked: !e.target.checked })} />
            {t("fieldsManager.panel.locked")}
            <span className="text-[12px] text-ink-secondary">{t("fieldsManager.panel.lockedHelp")}</span>
          </label>
        )}
        {field.fromTemplate && (
          <>
            <label className="flex items-center gap-2">
              {/* A calculated field is shown read-only (worked out live from the other answers); others can be edited. */}
              <input type="checkbox" checked={!!field.portalAccess && field.portalAccess !== "hidden"} onChange={(e) => onPatch(field.key, { portalAccess: e.target.checked ? (field.calculated ? "read" : "edit") : "hidden" }, { portalAccess: field.portalAccess ?? "hidden" })} />
              {t(field.calculated ? "fieldsManager.panel.showCalc" : "fieldsManager.panel.inPortal")}
            </label>
            {!field.calculated && field.portalAccess && field.portalAccess !== "hidden" && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <label>
                  {t("fieldsManager.panel.whoChanges")}{" "}
                  <select value={field.portalAccess} onChange={(e) => onPatch(field.key, { portalAccess: e.target.value }, { portalAccess: field.portalAccess })} className={input}>
                    {["edit", "approval", "read"].map((a) => (
                      <option key={a} value={a}>{t(`fieldsManager.portalAccess.${a}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("fieldsManager.panel.level")}{" "}
                  <select value={field.level ?? "basic"} onChange={(e) => onPatch(field.key, { level: e.target.value }, { level: field.level })} className={input}>
                    <option value="basic">{t("fieldsManager.groupBasic")}</option>
                    <option value="detailed">{t("fieldsManager.groupDetailed")}</option>
                  </select>
                </label>
              </div>
            )}
          </>
        )}
      </section>

      <section className={box}>
        <h4 className="font-semibold">{t("fieldsManager.usedIn")}</h4>
        <p className="text-[12px] text-ink-secondary">{t("fieldsManager.panel.usesHelp")}</p>
        <div className="grid grid-cols-2 gap-1">
          {USES.map((u) => (
            <label key={u} className="flex items-center gap-1">
              <input type="checkbox" checked={enabledFor(u)} onChange={(e) => onPatch(field.key, { surface: { use: u, on: e.target.checked } }, { surface: { use: u, on: !e.target.checked } })} />
              {t(`fieldsManager.use.${u}`)}
            </label>
          ))}
        </div>
        <div className="border-t border-mist pt-2">
          <div className="mb-1 font-medium">{t("fieldsManager.documents")}</div>
          {docs === null ? (
            <p className="text-ink-secondary">{t("fieldsManager.loading")}</p>
          ) : docs.filter((d) => !d.error).length === 0 ? (
            <p className="text-ink-secondary">—</p>
          ) : (
            docs.filter((d) => !d.error).map((d) => (
              <div key={d.docTypeId} className="flex items-center gap-2">
                <span className={usingDocs.includes(d) ? "" : "text-ink-secondary"}>{usingDocs.includes(d) ? "✓" : "·"} {d.name}</span>
                <button type="button" onClick={() => onOpenTab("documents", { doc: d.docTypeId })} className="ml-auto text-[12px] text-ember hover:underline">{t("fieldsManager.hintOpen")}</button>
              </div>
            ))
          )}
        </div>
      </section>

      {field.fieldType === "calculated" && (
        <section className={box}>
          {editCalc ? (
            <NewFieldForm overview={overview} edit={{ key: field.key, spec: field.options }} onDone={(k) => (setEditCalc(false), k && onChanged())} />
          ) : (
            <button type="button" onClick={() => setEditCalc(true)} className="rounded-lg border border-dashed border-ember/60 px-3 py-1 hover:bg-paper-2">{t("fieldsManager.editCalc")}</button>
          )}
        </section>
      )}

      {field.kind === "builtin" && field.calculated && (
        <section className={box}>
          <h4 className="font-semibold">{t("fieldsManager.panel.definition")}</h4>
          <p>{t(field.deps.length ? "fieldsManager.builtin.full_name" : "fieldsManager.builtin.registration_status")}</p>
        </section>
      )}
      {field.kind === "computed" && field.computedType && (
        <section className={box}>
          <h4 className="font-semibold">{t("fieldsManager.panel.definition")}</h4>
          <p>{t(`fieldsManager.builtin.${field.computedType}`)}</p>
          {Array.isArray(field.options) && field.options.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(field.options as string[]).map((o) => (
                <span key={o} className="rounded-full border border-mist px-2 py-0.5 text-[12px]">{o}</span>
              ))}
            </div>
          )}
          {field.computedType === "contact_email" ? (
            <ContactRuleEditor field={field} overview={overview} onPatch={onPatch} />
          ) : (
            BUILTIN_TAB[field.computedType] && (
              <Link href={`/events/${overview.eventId}?tab=${BUILTIN_TAB[field.computedType]}`} className="text-ember hover:underline">{t("fieldsManager.panel.changeThere")} ↗</Link>
            )
          )}
        </section>
      )}
    </div>
  );
}

/** {{Email}}: the rule the admin sets (Q-R2/Q-R3). Not saved = today's value (first guardian receiving mail). */
function ContactRuleEditor({ field, overview, onPatch }: { field: OvField; overview: FmOverview; onPatch: Props["onPatch"] }) {
  const { t } = useTranslations();
  const saved = (field.options as { contactRule?: unknown } | null)?.contactRule;
  const rule = saved ? readContactRule(saved) : null;
  const emailFields = overview.fields.filter((f) => f.fieldType === "email");
  const set = (r: Partial<typeof RECOMMENDED_RULE>) => onPatch(field.key, { contactRule: { ...(rule ?? RECOMMENDED_RULE), ...r } });
  return (
    <div className="space-y-2">
      {!rule && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-amber-900">
          <span className="flex-1">{t("fieldsManager.contact.todayRule")}</span>
          <button type="button" onClick={() => set({})} className="rounded border border-amber-300 px-2 py-0.5 text-[12px]">{t("fieldsManager.contact.useRecommended")}</button>
        </div>
      )}
      {rule && (
        <>
          <label className="block">
            {t("fieldsManager.contact.adults")}{" "}
            <select value={rule.adultSelfField ?? ""} onChange={(e) => set({ adultSelfField: e.target.value || null })} className={input}>
              <option value="">{t("fieldsManager.contact.adultsGuardian")}</option>
              <option value="auto">{t("fieldsManager.contact.adultsAuto")}</option>
              {emailFields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            {t("fieldsManager.contact.guardians")}{" "}
            <select value={rule.guardians} onChange={(e) => set({ guardians: e.target.value as typeof rule.guardians })} className={input}>
              {(["first_receiving", "all_receiving", "first"] as const).map((g) => (
                <option key={g} value={g}>{t(`fieldsManager.contact.g.${g}`)}</option>
              ))}
            </select>
          </label>
          {emailFields.length === 0 && rule.adultSelfField && <p className="text-[12px] text-amber-800">{t("fieldsManager.contact.noEmailField")}</p>}
          <p className="text-[12px] text-ink-secondary">{t("fieldsManager.contact.noPeopleDb")}</p>
        </>
      )}
    </div>
  );
}

function VariablePanel({ overview, variable, onChanged }: Props & { variable: FmVariable }) {
  const { t } = useTranslations();
  const [value, setValue] = useState(variable.raw ?? variable.value ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [sentences, setSentences] = useState<{ defaults: Record<string, string>; own: Record<string, string> } | null>(null);
  useEffect(() => {
    if (variable.edit !== "sentence") return;
    fetch("/api/fields/sentences").then((r) => (r.ok ? r.json() : null)).then(setSentences).catch(() => {});
  }, [variable.edit]);
  const send = async (url: string, method: string, body: object) => {
    setMsg(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMsg(res?.ok ? t("fieldsManager.import.saved2") : t("fieldsManager.saveFailed"));
    if (res?.ok) onChanged();
    return !!res?.ok;
  };
  const inputType = /^date_|deadline/.test(variable.key) ? "date" : /^price_/.test(variable.key) ? "number" : "text";
  const keysOf = (k: string) => (k === "details_link_line" ? ["details_link_line_portal", "details_link_line_page"] : [k]);
  return (
    <div className="space-y-2 rounded-xl border border-mist bg-paper p-4 text-[13px]">
      <h3 className="text-[15px] font-semibold text-ink">{variable.label}</h3>
      <div className="font-mono text-[12px] text-ink-secondary">{`{{${variable.key}}}`}</div>
      <span className="inline-block rounded-full border border-mist px-2 py-0.5 text-[11px] text-ink-secondary">{t(`fieldsManager.varCategory.${variable.category}`)}</span>
      <p className="text-ink-secondary">{t(`fieldsManager.varHelp.${variable.category}`)}</p>
      {variable.edit === "inline" && (
        <form className="flex gap-1" onSubmit={(e) => {
          e.preventDefault();
          if (variable.category === "free") send("/api/fields/variables", "PUT", { event: overview.eventId, key: variable.key, value });
          else send("/api/fields/event-values", "PATCH", { event: overview.eventId, key: variable.key, value });
        }}>
          <input type={inputType} value={value} onChange={(e) => setValue(e.target.value)} className={`${input} min-w-0 flex-1`} />
          <button className="rounded border border-mist px-2 hover:bg-paper-2">{t("fieldsManager.save")}</button>
        </form>
      )}
      {variable.edit === "link" && variable.href && (
        <>
          {variable.value !== null && <p>{variable.value || "—"}</p>}
          <Link href={variable.href} className="text-ember hover:underline">{t("fieldsManager.panel.changeThere")} ↗</Link>
        </>
      )}
      {variable.edit === "sentence" &&
        sentences &&
        keysOf(variable.key).map((k) => (
          <SentenceEditor key={k} k={k} def={sentences.defaults[k] ?? ""} own={sentences.own[k]} onSave={(text) => send("/api/fields/sentences", "PUT", { key: k, text })} />
        ))}
      {variable.aliases.length > 0 && <p className="text-[12px] text-ink-secondary">{t("fieldsManager.aliases")}: <span className="font-mono">{variable.aliases.join(", ")}</span></p>}
      {msg && <p className="text-[12px] text-ink-secondary">{msg}</p>}
    </div>
  );
}

function SentenceEditor({ k, def, own, onSave }: { k: string; def: string; own?: string; onSave: (text: string | null) => Promise<boolean> }) {
  const { t } = useTranslations();
  const [text, setText] = useState(own ?? def);
  return (
    <div className="space-y-1 border-t border-mist pt-2">
      {k.startsWith("details_link_line_") && <div className="text-[12px] font-medium">{t(`fieldsManager.sentence.${k}`)}</div>}
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-full`} />
      <p className="text-[12px] text-ink-secondary">{t("fieldsManager.sentence.help")}</p>
      <div className="flex gap-2">
        <button type="button" disabled={!text.includes("{value}")} onClick={() => onSave(text === def ? null : text)} className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2 disabled:opacity-40">{t("fieldsManager.save")}</button>
        {own !== undefined && (
          <button type="button" onClick={async () => (await onSave(null)) && setText(def)} className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2">{t("fieldsManager.sentence.reset")}</button>
        )}
      </div>
    </div>
  );
}

/** R12: a source's detail -- connection (sheet, last run, sync, settings), the form's questions, the portal's fields
 * by level with drag & drop between základní / podrobné. */
function SourcePanel({ overview, sourceId, onPatch, onOpenTab, onChanged }: Props & { sourceId: string }) {
  const { t } = useTranslations();
  const src = overview.sources.find((s) => s.id === sourceId);
  const fed = overview.fields.filter((f) => f.sources.includes(sourceId));
  if (!src) return null;
  const box = "rounded-xl border border-mist bg-paper p-3 text-[13px] space-y-2";
  return (
    <div className="space-y-3">
      <section className={box}>
        <h3 className="text-[15px] font-semibold">{src.label ?? t(src.labelKey ?? "")}</h3>
        <p className="text-ink-secondary">{t(`fieldsManager.source.${src.kind}`)}</p>
        {src.kind === "sync" && (
          <div className="flex flex-wrap gap-2">
            {src.autoSync && <span className="text-ink-secondary">{t("fieldsManager.everyHours", { n: String(src.everyHours ?? 1) })}</span>}
            <button type="button" onClick={() => onOpenTab("import")} className="rounded-lg border border-mist px-3 py-1 hover:bg-paper-2">{t("participantSync.syncNow")} / {t("participantSync.settings")}</button>
          </div>
        )}
        {src.kind === "form" && <Link href={`/events/${overview.eventId}?tab=verejna`} className="text-ember hover:underline">{t("fieldsManager.panel.changeThere")} ↗</Link>}
        {src.kind === "portal" && <p className="text-[12px] text-ink-secondary">{t("fieldsManager.source.portalHelp")}</p>}
      </section>
      {src.kind === "portal" ? (
        <PortalLevels overview={overview} onPatch={onPatch} onChanged={onChanged} />
      ) : (
        <section className={box}>
          <h4 className="font-semibold">{t("fieldsManager.source.fills", { n: String(fed.length) })}</h4>
          {fed.map((f) => (
            <div key={f.key}>{f.label} <span className="font-mono text-[11px] text-ink-secondary">{f.key}</span></div>
          ))}
        </section>
      )}
      <p className="text-[12px] text-ink-secondary">{t("fieldsManager.ctrlHelp")}</p>
    </div>
  );
}

/** R13/R14: a place where fields are used -- what it is, which fields are on there, link to its settings; documents
 * as one place with the list of templates and which fields each uses. */
function PlacePanel({ overview, docs, use, onOpenTab, onPatch, onChanged }: Props & { use: string }) {
  const { t } = useTranslations();
  const on = overview.fields.filter((f) => f.uses.includes(use as never));
  const box = "rounded-xl border border-mist bg-paper p-3 text-[13px] space-y-2";
  const href: Record<string, string> = { lists: `/events/${overview.eventId}/participants`, health: `/events/${overview.eventId}/health`, mail: `/events/${overview.eventId}/mail`, email: `/events/${overview.eventId}?tab=posta`, portal: `/events/${overview.eventId}?tab=portal`, form: `/events/${overview.eventId}?tab=verejna` };
  return (
    <div className="space-y-3">
      <section className={box}>
        <h3 className="text-[15px] font-semibold">{t(`fieldsManager.use.${use}`)}</h3>
        <p className="text-ink-secondary">{t(`fieldsManager.place.${use}`)}</p>
        {href[use] && <Link href={href[use]} className="text-ember hover:underline">{t("fieldsManager.place.open")} ↗</Link>}
      </section>
      {use === "portal" && <PortalLevels overview={overview} onPatch={onPatch} onChanged={onChanged} />}
      {use === "documents" && <TemplatePills overview={overview} docs={docs} onOpenTab={onOpenTab} onChanged={onChanged} />}
      <section className={box}>
        <h4 className="font-semibold">{t("fieldsManager.place.fields", { n: String(on.length) })}</h4>
        {on.map((f) => (
          <div key={f.key}>{f.label} <span className="font-mono text-[11px] text-ink-secondary">{f.key}</span></div>
        ))}
      </section>
      <p className="text-[12px] text-ink-secondary">{t("fieldsManager.ctrlHelp")}</p>
    </div>
  );
}

/** The parent portal's fields by level (základní / podrobné): drag between them, change who may change a value, add a
 * field. The same block from Zdroje → Rodičovský portál and from Kde se používá → Rodičovský portál. */
function PortalLevels({ overview, onPatch, onChanged }: { overview: FmOverview; onPatch: Props["onPatch"]; onChanged: () => void }) {
  const { t } = useTranslations();
  const [drag, setDrag] = useState<string | null>(null);
  const inPortal = overview.fields.filter((f) => f.fromTemplate && f.portalAccess && f.portalAccess !== "hidden");
  const addable = overview.fields.filter((f) => f.fromTemplate && !f.calculated && (!f.portalAccess || f.portalAccess === "hidden"));
  const box = "rounded-xl border border-mist bg-paper p-3 text-[13px] space-y-2";
  return (
    <>
      {(["basic", "detailed"] as const).map((level) => (
        <section
          key={level}
          className={`${box} ${drag ? "ring-1 ring-ember/40" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async () => {
            const f = overview.fields.find((x) => x.key === drag);
            setDrag(null);
            if (f && (f.level ?? "basic") !== level) {
              await onPatch(f.key, { level }, { level: f.level });
              onChanged();
            }
          }}
        >
          <h4 className="font-semibold">{t(level === "basic" ? "fieldsManager.groupBasic" : "fieldsManager.groupDetailed")}</h4>
          {inPortal.filter((f) => (f.level ?? "basic") === level).map((f) => (
            <div key={f.key} draggable onDragStart={() => setDrag(f.key)} className="flex cursor-grab items-center gap-2 rounded border border-mist px-2 py-1">
              <span className="flex-1">⋮⋮ {f.label} <span className="font-mono text-[11px] text-ink-secondary">{f.key}</span></span>
              <select value={f.portalAccess ?? "hidden"} onChange={(e) => onPatch(f.key, { portalAccess: e.target.value }, { portalAccess: f.portalAccess })} className={input}>
                {["edit", "approval", "read", "hidden"].map((a) => (
                  <option key={a} value={a}>{t(`fieldsManager.portalAccess.${a}`)}</option>
                ))}
              </select>
            </div>
          ))}
          {inPortal.filter((f) => (f.level ?? "basic") === level).length === 0 && <p className="text-[12px] text-ink-secondary">{t("fieldsManager.source.dropHere")}</p>}
        </section>
      ))}
      {addable.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onPatch(e.target.value, { portalAccess: "edit" }, { portalAccess: "hidden" })} className={`${input} w-full`}>
          <option value="">+ {t("fieldsManager.source.addToPortal")}</option>
          {addable.map((f) => (
            <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
          ))}
        </select>
      )}
    </>
  );
}

/** Šablony dokumentů: a pill per template; open one to switch fields off / on for that template only (default on). */
function TemplatePills({ overview, docs, onOpenTab, onChanged }: { overview: FmOverview; docs: FmDocTemplate[] | null; onOpenTab: Props["onOpenTab"]; onChanged: () => void }) {
  const { t } = useTranslations();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const docFields = overview.fields.filter((f) => f.uses.includes("documents"));
  const box = "rounded-xl border border-mist bg-paper p-3 text-[13px] space-y-2";
  if (docs === null) return <p className="text-ink-secondary">{t("fieldsManager.loadingDocuments")}</p>;
  const toggle = async (docType: string, key: string, on: boolean) => {
    setBusy(true);
    await fetch("/api/fields/doc-fields", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: overview.eventId, docType, key, on }) }).catch(() => null);
    setBusy(false);
    onChanged();
  };
  return (
    <section className={box}>
      <h4 className="font-semibold">{t("fieldsManager.place.templates")}</h4>
      <div className="flex flex-wrap gap-1">
        {docs.map((d) => (
          <button key={d.docTypeId} type="button" onClick={() => setOpen(open === d.docTypeId ? null : d.docTypeId)} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${open === d.docTypeId ? "border-ember bg-paper-2" : "border-mist"} ${d.error ? "text-red-700" : ""}`}>
            {d.name}{d.disabled?.length ? ` · −${d.disabled.length}` : ""}
          </button>
        ))}
      </div>
      {docs.filter((d) => d.docTypeId === open).map((d) => {
        const used = new Set(d.placeholders.map((p) => p.key));
        return (
          <div key={d.docTypeId} className="space-y-1 border-t border-mist pt-2">
            <p className="text-[12px] text-ink-secondary">{t("fieldsManager.place.pillsHelp")}</p>
            <div className="flex flex-wrap gap-1">
              {docFields.map((f) => {
                const on = !d.disabled?.includes(f.key);
                return (
                  <button key={f.key} type="button" disabled={busy} onClick={() => toggle(d.docTypeId, f.key, !on)} title={used.has(f.key) ? t("fieldsManager.place.usedInTemplate") : undefined} className={`rounded-full border px-2 py-0.5 text-[12px] ${on ? "border-pine bg-pine-bg text-pine" : "border-mist text-ink-secondary line-through"} ${used.has(f.key) ? "font-semibold" : ""}`}>
                    {f.label}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => onOpenTab("documents", { doc: d.docTypeId })} className="text-[12px] text-ember hover:underline">{t("fieldsManager.hintOpen")} ↗</button>
          </div>
        );
      })}
    </section>
  );
}

const PLAIN_TYPES = ["text", "longtext", "number", "date", "boolean", "select", "multi", "consent", "email", "phone"] as const;
/** 2026-11-24: an existing field's type and choices -- an organization field everywhere, an event field here. */
function TypeEditor({ field, onPatch }: { field: OvField; onPatch: Props["onPatch"] }) {
  const { t } = useTranslations();
  const current = Array.isArray(field.options) ? (field.options as unknown[]).filter((o): o is string => typeof o === "string") : [];
  const [type, setType] = useState(field.fieldType);
  const [choices, setChoices] = useState(current.join("\n"));
  const choice = type === "select" || type === "multi";
  const list = choices.split("\n").map((x) => x.trim()).filter(Boolean);
  const changed = type !== field.fieldType || (choice && list.join("\n") !== current.join("\n"));
  return (
    <details className="rounded-lg border border-mist p-2" open={field.fieldType === "select" || field.fieldType === "multi"}>
      <summary className="cursor-pointer font-medium">{t("fieldsManager.panel.typeAndOptions")}: {t(`fieldsManager.type.${field.fieldType}`)}{current.length ? ` (${current.length})` : ""}</summary>
      <div className="mt-2 space-y-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
          {PLAIN_TYPES.map((x) => (
            <option key={x} value={x}>{t(`fieldsManager.type.${x}`)}</option>
          ))}
        </select>
        {choice && <textarea rows={5} value={choices} onChange={(e) => setChoices(e.target.value)} placeholder={t("fieldsManager.optionsOnePerLine")} className={`${input} w-full`} />}
        <p className="text-[12px] text-ink-secondary">{t(field.fromTemplate ? "fieldsManager.panel.typeOrgWide" : "fieldsManager.panel.typeEventOnly")}</p>
        {type !== field.fieldType && <p className="text-[12px] text-amber-800">{t("fieldsManager.panel.typeChangeWarn")}</p>}
        <button
          type="button"
          disabled={!changed || (choice && !list.length)}
          onClick={() => onPatch(field.key, { ...(type !== field.fieldType && { fieldType: type }), ...(choice && { choices: list }) }, { fieldType: field.fieldType, ...(current.length && { choices: current }) })}
          className="rounded border border-mist px-2 py-0.5 hover:bg-paper-2 disabled:opacity-40"
        >
          {t("fieldsManager.save")}
        </button>
      </div>
    </details>
  );
}
