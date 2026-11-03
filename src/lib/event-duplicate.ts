// "Duplikovat akci" (2026-10-23): a new event with the organization's defaults (src/lib/event-create.ts),
// then the chosen parts (src/lib/event-duplicate-parts.ts) replaced by the source event's. Never copied:
// participants, bills, documents received, orders, planning days, the public address (slug must be new),
// the scan link, the Drive manifest. References between copied rows (payment document, e-mail attachments,
// activity locations) are mapped to the new rows; one whose target wasn't copied is dropped.
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { createEventWithDefaults } from "@/lib/event-create";
import { readEmailAttachments } from "@/lib/email-attachments";
import type { DuplicatePart } from "@/lib/event-duplicate-parts";

const json = (v: unknown) => (v == null ? undefined : (v as Prisma.InputJsonValue));

export async function duplicateEvent(sourceId: string, o: { name: string; startDate: string; endDate: string; parts: DuplicatePart[] }) {
  const src = await prisma.event.findUniqueOrThrow({
    where: { id: sourceId },
    include: { categories: true, modules: true, moduleAccess: true, authorAccess: true, eventListItems: true, eventEmailTemplates: true, eventParticipantFields: true, planActivities: true },
  });
  const has = (p: DuplicatePart) => o.parts.includes(p);
  const event = await createEventWithDefaults({ name: o.name, startDate: o.startDate, endDate: o.endDate, organizationId: src.organizationId, isPublic: src.kind === "public_event" });
  const id = event.id;

  return prisma.$transaction(async (tx) => {
    // Old list item id -> new (document types, locations, ...), when the lists are copied.
    const itemIds = new Map<string, string>();
    if (has("documents")) {
      await tx.eventListItem.deleteMany({ where: { eventId: id } });
      for (const i of src.eventListItems) {
        const row = await tx.eventListItem.create({ data: { eventId: id, kind: i.kind, key: i.key, name: i.name, sortOrder: i.sortOrder, active: i.active, isFromTemplate: i.isFromTemplate, data: json(i.data) } });
        itemIds.set(i.id, row.id);
      }
    }
    if (has("categories")) {
      await tx.eventCategory.deleteMany({ where: { eventId: id } });
      await tx.eventCategory.createMany({ data: src.categories.map((c) => ({ eventId: id, name: c.name, description: c.description, budgetAmount: c.budgetAmount, isFromTemplate: c.isFromTemplate, categoryTemplateId: c.categoryTemplateId })) });
    }
    if (has("fields")) {
      await tx.eventParticipantField.deleteMany({ where: { eventId: id } });
      await tx.eventParticipantField.createMany({
        data: src.eventParticipantFields.map((f) => ({ eventId: id, key: f.key, label: f.label, fieldType: f.fieldType, options: json(f.options), surfaces: f.surfaces, sortOrder: f.sortOrder, active: f.active, isFromTemplate: f.isFromTemplate, kind: f.kind, computedType: f.computedType, requiredOnRegistration: f.requiredOnRegistration })),
      });
    }
    if (has("modules")) {
      await tx.eventModule.deleteMany({ where: { eventId: id } });
      await tx.eventModule.createMany({ data: src.modules.map((m) => ({ eventId: id, moduleKey: m.moduleKey, enabled: m.enabled })) });
    }
    if (has("emails")) {
      await tx.eventEmailTemplate.createMany({ data: src.eventEmailTemplates.map((t) => ({ eventId: id, purposeKey: t.purposeKey, name: t.name, subject: t.subject, body: t.body, isFromTemplate: t.isFromTemplate })) });
    }
    if (has("access")) {
      await tx.userEventModuleAccess.createMany({ data: src.moduleAccess.map((a) => ({ eventId: id, userId: a.userId, moduleKey: a.moduleKey })), skipDuplicates: true });
      await tx.authorEventAccess.createMany({ data: src.authorAccess.map((a) => ({ eventId: id, authorId: a.authorId })), skipDuplicates: true });
    }
    if (has("planning")) {
      await tx.planActivity.createMany({
        data: src.planActivities.map((a) => ({
          eventId: id, name: a.name, defaultDurationMin: a.defaultDurationMin, description: a.description, categories: json(a.categories), defaultLeaderId: a.defaultLeaderId,
          defaultLocationId: a.defaultLocationId ? (itemIds.get(a.defaultLocationId) ?? null) : null, energyLevel: a.energyLevel, repeatable: a.repeatable, active: a.active, sourceTemplateId: a.sourceTemplateId,
        })) as Prisma.PlanActivityCreateManyInput[],
      });
    }

    // A set year (VS year, membership year checked) moves with the dates: Registrace 2027 (starts in 2026, VS 27) -> its copy 28.
    const yearShift = new Date(o.startDate).getUTCFullYear() - src.startDate.getUTCFullYear();
    const mapIds = (ids: string[]) => ids.map((x) => itemIds.get(x)).filter((x): x is string => !!x);
    const attachments = has("emails") && has("documents") ? Object.fromEntries(Object.entries(readEmailAttachments(src.emailAttachments)).map(([k, v]) => [k, mapIds(v)]).filter(([, v]) => v.length)) : {};
    await tx.event.update({
      where: { id },
      data: {
        kind: src.kind,
        membershipYear: src.kind === "membership" && src.membershipYear ? src.membershipYear + 1 : null,
        ...(has("basics") && {
          location: src.location, portalInfo: src.portalInfo, mailQuestionnaireUrl: src.mailQuestionnaireUrl, senderEmail: src.senderEmail, mailDoneLabelName: src.mailDoneLabelName, qrSizeMm: src.qrSizeMm,
          participantsListColumns: json(src.participantsListColumns), billsListColumns: json(src.billsListColumns), billsListPills: json(src.billsListPills), documentsListColumns: json(src.documentsListColumns),
          healthListColumns: json(src.healthListColumns), participantLayout: json(src.participantLayout), healthNotes: json(src.healthNotes), planningSettings: json(src.planningSettings), manifestCategoryMode: src.manifestCategoryMode,
        }),
        ...(has("payment") && {
          memberPriceCzk: src.memberPriceCzk, nonMemberPriceCzk: src.nonMemberPriceCzk, priceRules: json(src.priceRules), registrationBankAccountNumber: src.registrationBankAccountNumber, registrationBankCode: src.registrationBankCode,
          vsYear: src.vsYear == null ? null : (src.vsYear + yearShift) % 100,
          vsEventType: src.vsEventType, vsMembershipFieldKey: src.vsMembershipFieldKey, vsMemberValues: json(src.vsMemberValues), autoAccept: src.autoAccept,
          bankAccountId: src.bankAccountId, bankCheckEnabled: src.bankCheckEnabled && (!src.paymentDocTypeId || itemIds.has(src.paymentDocTypeId)), bankCheckIntervalMin: src.bankCheckIntervalMin,
          paymentDocTypeId: src.paymentDocTypeId ? (itemIds.get(src.paymentDocTypeId) ?? null) : null,
        }),
        ...(has("registration") && {
          registrationConnected: src.registrationConnected, peopleLinkMode: src.peopleLinkMode, membershipCheckYear: src.membershipCheckYear == null ? null : src.membershipCheckYear + yearShift, eligibility: json(src.eligibility), landingContent: src.landingContent, publicHideHeader: src.publicHideHeader,
          appearance: json(src.appearance), publicTexts: json(src.publicTexts), publicContactEmail: src.publicContactEmail, publicAudience: src.publicAudience, detailsAfterAcceptance: src.detailsAfterAcceptance,
        }),
        ...(has("tickets") && src.kind === "public_event" && { ticketSettings: json(src.ticketSettings), ...(!has("payment") && { priceRules: json(src.priceRules) }) }),
        ...(has("drive") && {
          driveIngestFolderId: src.driveIngestFolderId, driveExportFolderId: src.driveExportFolderId, driveParticipantsFolderId: src.driveParticipantsFolderId, driveManifestFolderId: src.driveManifestFolderId, driveHealthFolderId: src.driveHealthFolderId, driveParticipantsListFolderId: src.driveParticipantsListFolderId, drivePlanningFolderId: src.drivePlanningFolderId, driveTicketsFolderId: src.driveTicketsFolderId, driveProcessedFolderId: src.driveProcessedFolderId,
          driveDocSyncEnabled: src.driveDocSyncEnabled, participantsSheetId: src.participantsSheetId, participantsColumnMapping: json(src.participantsColumnMapping), participantSyncs: json(src.participantSyncs),
        }),
        ...(Object.keys(attachments).length && { emailAttachments: attachments }),
      },
    });
    return { id };
  });
}
