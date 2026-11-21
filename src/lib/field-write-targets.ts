// Decision A (docs/fields-manager-design/design.md §7): the ONE place that decides where a field's value is written.
// Pure. Today's behaviour = every template field has storage "profile", event-only fields have no template.
export type WriteSource = "portal" | "admin" | "import" | "public_form";
export type WriteTargets = { registration: boolean; profile: "write" | "propose" | "no" };

export function writeTargets(
  field: { fromTemplate: boolean; storage?: string | null; portalAccess?: string | null },
  ctx: { source: WriteSource; override?: "registration_only" },
): WriteTargets {
  // Event-only field, a template stored on the registration only (e.g. t-shirt size), or an import told so.
  if (!field.fromTemplate || field.storage === "event" || ctx.override === "registration_only") return { registration: true, profile: "no" };
  if (ctx.source !== "portal") return { registration: true, profile: "write" };
  // Parents: as the portal rule says (edit = write, approval = a proposal the admin approves, else nothing).
  return { registration: true, profile: field.portalAccess === "edit" ? "write" : field.portalAccess === "approval" ? "propose" : "no" };
}
