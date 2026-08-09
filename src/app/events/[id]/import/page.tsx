"use client";

import { useState, useEffect, use, useRef } from "react";
import { useTranslations } from "@/lib/i18n";

type CreatedBill = { id: string; originalFilename: string };
type Author = { id: string; canonicalName: string; active: boolean };
type EventCategoryOption = { id: string; name: string };

type DraftFields = {
  merchant: string;
  authorId: string;
  date: string;
  paid: boolean;
  categoryId: string;
};

const EMPTY_DRAFT: DraftFields = { merchant: "", authorId: "", date: "", paid: false, categoryId: "" };

const inputSm =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember disabled:bg-paper disabled:text-ink-secondary";
const label = "mb-1 block text-[12px] text-ink-secondary";

export default function EventImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [authors, setAuthors] = useState<Author[]>([]);
  const [categories, setCategories] = useState<EventCategoryOption[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdBills, setCreatedBills] = useState<CreatedBill[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [splitCount, setSplitCount] = useState(0);
  const [failureCount, setFailureCount] = useState(0);

  const [bulk, setBulk] = useState<DraftFields>(EMPTY_DRAFT);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, DraftFields>>({});
  const [reprocessWithAi, setReprocessWithAi] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/authors`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAuthors)
      .catch(() => {});
    fetch(`/api/events/${eventId}/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories)
      .catch(() => {});
  }, [eventId]);

  async function handleFiles(fileList: FileList | null, channel: "upload" | "camera") {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    for (const file of Array.from(fileList)) {
      formData.append("files", file);
    }
    formData.append("ingestChannel", channel);

    const res = await fetch(`/api/events/${eventId}/bills`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (!res.ok) {
      setError(t("eventDetail.errorUploadFailed"));
      return;
    }

    const data = await res.json();
    setCreatedBills((prev) => [
      ...prev,
      ...data.created.map((b: { id: string; originalFilename: string }) => ({
        id: b.id,
        originalFilename: b.originalFilename,
      })),
    ]);
    setDuplicateCount((c) => c + (data.duplicates?.length || 0));
    setSplitCount((c) => c + (data.splitInfo?.length || 0));
    setFailureCount((c) => c + (data.failures?.length || 0));

    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files, "upload");
  }

  async function handleDriveImport() {
    setUploading(true);
    setError(null);

    const res = await fetch(`/api/events/${eventId}/drive-import`, { method: "POST" });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(t(`importPage.error.${data.error}`) || t("importPage.driveImportFailed"));
      return;
    }

    const data = await res.json();
    const newBills = data.ingest.created as {
      id: string;
      originalFilename: string;
      payerAuthorId: string | null;
    }[];

    setCreatedBills((prev) => [
      ...prev,
      ...newBills.map((b) => ({ id: b.id, originalFilename: b.originalFilename })),
    ]);
    setDuplicateCount((c) => c + (data.ingest.duplicates?.length || 0));
    setSplitCount((c) => c + (data.ingest.splitInfo?.length || 0));
    setFailureCount(
      (c) => c + (data.ingest.failures?.length || 0) + (data.downloadFailures?.length || 0)
    );

    const driveOverrides: Record<string, DraftFields> = {};
    const driveUnlockedIds: string[] = [];
    for (const b of newBills) {
      if (b.payerAuthorId) {
        driveOverrides[b.id] = { ...EMPTY_DRAFT, authorId: b.payerAuthorId };
        driveUnlockedIds.push(b.id);
      }
    }
    if (driveUnlockedIds.length > 0) {
      setOverrides((o) => ({ ...o, ...driveOverrides }));
      setUnlocked((prev) => new Set([...prev, ...driveUnlockedIds]));
    }
  }

  function effectiveFor(billId: string): DraftFields {
    return unlocked.has(billId) ? (overrides[billId] ?? bulk) : bulk;
  }

  function toggleUnlock(billId: string) {
    setUnlocked((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
        setOverrides((o) => (o[billId] ? o : { ...o, [billId]: { ...bulk } }));
      }
      return next;
    });
  }

  function updateOverride(billId: string, patch: Partial<DraftFields>) {
    setOverrides((o) => ({ ...o, [billId]: { ...(o[billId] ?? bulk), ...patch } }));
  }

  async function patchOneBill(bill: CreatedBill): Promise<void> {
    const effective = effectiveFor(bill.id);
    const patchBody: Record<string, unknown> = {};
    if (effective.merchant) patchBody.merchantName = effective.merchant;
    if (effective.authorId) patchBody.payerAuthorId = effective.authorId;
    if (effective.date) patchBody.billDate = effective.date;
    if (effective.categoryId) patchBody.pendingCategoryId = effective.categoryId;

    if (Object.keys(patchBody).length > 0) {
      await fetch(`/api/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
    }

    if (effective.paid && effective.authorId) {
      await fetch(`/api/bills/${bill.id}/paid`, { method: "POST" });
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);

    const fieldFailures: string[] = [];
    await Promise.all(
      createdBills.map(async (bill) => {
        try {
          await patchOneBill(bill);
        } catch {
          fieldFailures.push(bill.originalFilename);
        }
      })
    );

    let aiTriggerFailed = false;
    if (reprocessWithAi && createdBills.length > 0) {
      const ids = createdBills.map((b) => b.id);
      for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        try {
          await fetch(`/api/events/${eventId}/bills/bulk-ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ billIds: chunk }),
          });
        } catch {
          aiTriggerFailed = true;
        }
      }
    }

    setConfirming(false);

    const messages: string[] = [];
    if (fieldFailures.length > 0) {
      messages.push(t("importPage.confirmPartialFailure", { count: String(fieldFailures.length) }));
    }
    if (aiTriggerFailed) {
      messages.push(t("importPage.aiTriggerFailed"));
    }
    if (messages.length > 0) setError(messages.join(" "));

    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        {error && <p className="mb-4 text-[14px] text-amber-700">{error}</p>}
        <p className="mb-4 text-[14px] text-pine">
          {t("importPage.doneMessage", { count: String(createdBills.length) })}
        </p>
        <a href={`/events/${eventId}/bills`} className="text-[14px] text-ember hover:underline">
          {t("importPage.goToBills")}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${eventId}/bills`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">{t("importPage.title")}</h1>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={
          "mb-4 rounded-lg border-2 border-dashed p-8 text-center " +
          (dragging ? "border-ember bg-ember/5" : "border-mist bg-paper-2")
        }
      >
        <p className="mb-3 text-[14px] text-ink-secondary">{t("importPage.dropzoneHint")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <label className="cursor-pointer rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover">
            {t("eventDetail.uploadFiles")}
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => handleFiles(e.target.files, "upload")}
              className="hidden"
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2">
            {t("eventDetail.takePhoto")}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFiles(e.target.files, "camera")}
              className="hidden"
            />
          </label>
          <button
            onClick={handleDriveImport}
            disabled={uploading}
            className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50"
          >
            {t("importPage.driveImportButton")}
          </button>
        </div>
        {uploading && <p className="mt-2 text-[13px] text-ink-secondary">{t("common.loading")}</p>}
      </div>

      {(duplicateCount > 0 || splitCount > 0 || failureCount > 0) && (
        <p className="mb-4 text-[13px] text-amber-700">
          {t("importPage.ingestSummary", {
            duplicates: String(duplicateCount),
            splits: String(splitCount),
            failures: String(failureCount),
          })}
        </p>
      )}

      {createdBills.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-mist bg-paper-2 p-4">
            <div>
              <label className={label}>{t("importPage.colMerchant")}</label>
              <input
                type="text"
                value={bulk.merchant}
                onChange={(e) => setBulk((b) => ({ ...b, merchant: e.target.value }))}
                placeholder={t("importPage.merchantPlaceholder")}
                className={inputSm}
              />
            </div>
            <div>
              <label className={label}>{t("importPage.colAuthor")}</label>
              <select
                value={bulk.authorId}
                onChange={(e) => setBulk((b) => ({ ...b, authorId: e.target.value }))}
                className={inputSm}
              >
                <option value="">{t("billModal.payerEvent")}</option>
                {authors
                  .filter((a) => a.active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.canonicalName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={label}>{t("importPage.colDate")}</label>
              <input
                type="date"
                value={bulk.date}
                onChange={(e) => setBulk((b) => ({ ...b, date: e.target.value }))}
                className={inputSm}
              />
            </div>
            <div>
              <label className={label}>{t("importPage.colCategory")}</label>
              <select
                value={bulk.categoryId}
                onChange={(e) => setBulk((b) => ({ ...b, categoryId: e.target.value }))}
                className={inputSm}
              >
                <option value="">{t("importPage.noCategoryOption")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={bulk.paid}
                onChange={(e) => setBulk((b) => ({ ...b, paid: e.target.checked }))}
              />
              {t("importPage.paidLabel")}
            </label>
          </div>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-mist text-left">
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colFile")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colMerchant")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colAuthor")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colDate")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colCategory")}</th>
                  <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("importPage.colPaid")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {createdBills.map((bill) => {
                  const isUnlocked = unlocked.has(bill.id);
                  const values = effectiveFor(bill.id);
                  return (
                    <tr key={bill.id} className="border-b border-mist/60">
                      <td className="p-2 text-[14px]">
                        <a
                          href={`/api/bills/${bill.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ember hover:underline"
                        >
                          {bill.originalFilename}
                        </a>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={values.merchant}
                          disabled={!isUnlocked}
                          onChange={(e) => updateOverride(bill.id, { merchant: e.target.value })}
                          className={inputSm + " w-full"}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={values.authorId}
                          disabled={!isUnlocked}
                          onChange={(e) => updateOverride(bill.id, { authorId: e.target.value })}
                          className={inputSm + " w-full"}
                        >
                          <option value="">{t("billModal.payerEvent")}</option>
                          {authors
                            .filter((a) => a.active)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.canonicalName}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          value={values.date}
                          disabled={!isUnlocked}
                          onChange={(e) => updateOverride(bill.id, { date: e.target.value })}
                          className={inputSm}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={values.categoryId}
                          disabled={!isUnlocked}
                          onChange={(e) => updateOverride(bill.id, { categoryId: e.target.value })}
                          className={inputSm + " w-full"}
                        >
                          <option value="">{t("importPage.noCategoryOption")}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={values.paid}
                          disabled={!isUnlocked}
                          onChange={(e) => updateOverride(bill.id, { paid: e.target.checked })}
                        />
                      </td>
                      <td className="whitespace-nowrap p-2">
                        <button
                          onClick={() => toggleUnlock(bill.id)}
                          className={"text-[13px] hover:underline " + (isUnlocked ? "text-amber-700" : "text-ember")}
                        >
                          {isUnlocked ? t("importPage.lockRow") : t("importPage.unlockRow")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label className="mb-4 flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={reprocessWithAi}
              onChange={(e) => setReprocessWithAi(e.target.checked)}
            />
            {t("importPage.reprocessAiLabel")}
          </label>

          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-lg bg-ember px-5 py-2.5 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
          >
            {confirming ? t("common.loading") : t("importPage.confirmButton")}
          </button>
        </>
      )}
    </div>
  );
}
