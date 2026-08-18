"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import BodyMapPicker, { type BodyMapValue } from "./BodyMapPicker";

type IncidentCategory = "illness" | "injury" | "parasite" | "medication" | "other";

const CATEGORIES: IncidentCategory[] = ["illness", "injury", "parasite", "medication", "other"];

export type IncidentClientData = {
  id: string;
  category: IncidentCategory;
  templateType: string | null;
  actionSummary: string;
  pillName: string | null;
  details: string;
  photoGcsPath: string | null;
  tempC: string | null;
  bodyView: "front" | "back" | null;
  bodyXPct: string | null;
  bodyYPct: string | null;
};

type ListItem = { id: string; key: string | null; name: string; data: unknown };
type SituationData = {
  category?: IncidentCategory;
  shortDescription?: string;
  defaultMed?: string;
  defaultTemp?: number;
  defaultDetails?: string;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const FREE_TEXT_MED = "__free_text__";

function photoUrl(eventId: string, photoGcsPath: string | null): string | null {
  if (!photoGcsPath) return null;
  const filename = photoGcsPath.split("/").pop();
  return `/api/events/${eventId}/incident-photos/${filename}`;
}

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("compress_failed");
  return blob;
}

interface IncidentFormModalProps {
  eventId: string;
  participantId: string;
  mode: "new" | "edit" | "follow-up";
  incident?: IncidentClientData;
  onClose: () => void;
  onSaved: () => void;
}

export default function IncidentFormModal({
  eventId,
  participantId,
  mode,
  incident,
  onClose,
  onSaved,
}: IncidentFormModalProps) {
  const { t } = useTranslations();
  const isFollowUp = mode === "follow-up";
  const isEdit = mode === "edit";

  const [category, setCategory] = useState<IncidentCategory>(incident?.category ?? "illness");
  const [templateType, setTemplateType] = useState<string | null>(
    isEdit ? (incident?.templateType ?? null) : null
  );
  const [actionSummary, setActionSummary] = useState(isEdit ? (incident?.actionSummary ?? "") : "");
  const [details, setDetails] = useState(isEdit ? (incident?.details ?? "") : "");
  const [tempC, setTempC] = useState(isEdit ? (incident?.tempC ?? "") : "");
  const [selectedMedId, setSelectedMedId] = useState<string>(FREE_TEXT_MED);
  const [pillName, setPillName] = useState(isEdit ? (incident?.pillName ?? "") : "");
  const [photoGcsPath, setPhotoGcsPath] = useState<string | null>(isEdit ? (incident?.photoGcsPath ?? null) : null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bodyMap, setBodyMap] = useState<BodyMapValue>(
    incident?.bodyView && incident.bodyXPct !== null && incident.bodyYPct !== null
      ? { bodyView: incident.bodyView, bodyXPct: Number(incident.bodyXPct), bodyYPct: Number(incident.bodyYPct) }
      : null
  );

  const [situations, setSituations] = useState<ListItem[]>([]);
  const [meds, setMeds] = useState<ListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/list-items?kind=situation`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setSituations)
      .catch(() => {});
    fetch(`/api/events/${eventId}/list-items?kind=med`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setMeds)
      .catch(() => {});
  }, [eventId]);

  function applySituation(item: ListItem) {
    const data = (item.data ?? {}) as SituationData;
    if (data.category) setCategory(data.category);
    if (data.shortDescription) setActionSummary(data.shortDescription);
    if (data.defaultMed) setPillName(data.defaultMed);
    if (data.defaultTemp !== undefined) setTempC(String(data.defaultTemp));
    if (data.defaultDetails) setDetails(data.defaultDetails);
    setTemplateType(item.key ?? item.id);
  }

  async function handlePhotoFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed, "incident.jpg");
      const res = await fetch(`/api/events/${eventId}/incident-photos`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const data = await res.json();
      setPhotoGcsPath(data.gcsObjectPath);
    } catch {
      setError(t("incidentForm.errorPhotoFailed"));
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionSummary.trim() || !details.trim()) return;
    setSaving(true);
    setError(null);

    const effectivePillName =
      selectedMedId !== FREE_TEXT_MED ? meds.find((m) => m.id === selectedMedId)?.name ?? "" : pillName;

    const commonFields = {
      actionSummary: actionSummary.trim(),
      pillName: effectivePillName.trim() || undefined,
      details: details.trim(),
      photoGcsPath: photoGcsPath || undefined,
      tempC: tempC === "" ? undefined : Number(tempC),
      bodyView: isFollowUp ? undefined : bodyMap?.bodyView,
      bodyXPct: isFollowUp ? undefined : bodyMap?.bodyXPct,
      bodyYPct: isFollowUp ? undefined : bodyMap?.bodyYPct,
    };

    let res: Response;
    if (isEdit && incident) {
      res = await fetch(`/api/incidents/${incident.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateType: "correct", ...commonFields }),
      });
    } else {
      res = await fetch(`/api/participants/${participantId}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commonFields,
          category: isFollowUp ? undefined : category,
          templateType: isFollowUp ? undefined : templateType,
          parentIncidentId: isFollowUp ? incident?.id : undefined,
        }),
      });
    }

    setSaving(false);
    if (!res.ok) {
      setError(t("incidentForm.errorSaveFailed"));
      return;
    }
    onSaved();
    onClose();
  }

  const previewUrl = photoUrl(eventId, photoGcsPath);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
        <h2 className="mb-4 text-[16px] font-semibold text-ink">
          {isFollowUp ? t("incidentForm.titleFollowUp") : isEdit ? t("incidentForm.titleEdit") : t("incidentForm.titleNew")}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isFollowUp ? (
            <p className="rounded-lg border border-mist bg-paper-2 p-2 text-[13px] text-ink-secondary">
              {t("incidentForm.followUpLockedNote", { category: t(`incidentForm.category.${category}`) })}
            </p>
          ) : (
            <>
              {situations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {situations.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applySituation(s)}
                      className="rounded-full border border-mist bg-paper-2 px-2.5 py-1 text-[12px] text-ink hover:bg-mist"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IncidentCategory)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`incidentForm.category.${c}`)}
                  </option>
                ))}
              </select>
            </>
          )}

          <input
            type="text"
            placeholder={t("incidentForm.summaryLabel")}
            value={actionSummary}
            onChange={(e) => setActionSummary(e.target.value)}
            className={inputClass}
            autoFocus
          />

          <input
            type="number"
            step="0.1"
            placeholder={t("incidentForm.tempLabel")}
            value={tempC}
            onChange={(e) => setTempC(e.target.value)}
            className={inputClass}
          />

          {meds.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <select
                value={selectedMedId}
                onChange={(e) => setSelectedMedId(e.target.value)}
                className={inputClass}
              >
                <option value={FREE_TEXT_MED}>{t("incidentForm.medOther")}</option>
                {meds.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {selectedMedId === FREE_TEXT_MED && (
                <input
                  type="text"
                  placeholder={t("incidentForm.medLabel")}
                  value={pillName}
                  onChange={(e) => setPillName(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          ) : (
            <input
              type="text"
              placeholder={t("incidentForm.medLabel")}
              value={pillName}
              onChange={(e) => setPillName(e.target.value)}
              className={inputClass}
            />
          )}

          <textarea
            placeholder={t("incidentForm.detailsLabel")}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className={inputClass}
            rows={3}
          />

          <div>
            <div className="mb-1 text-[13px] text-ink-secondary">{t("incidentForm.photoLabel")}</div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="mb-2 h-32 w-32 rounded-lg object-cover" />
            )}
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist">
                {t("incidentForm.choosePhoto")}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoFile(e.target.files)}
                  className="hidden"
                />
              </label>
              <label className="cursor-pointer rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist">
                {t("incidentForm.takePhoto")}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoFile(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>
            {uploadingPhoto && <p className="mt-1 text-[12px] text-ink-secondary">{t("common.loading")}</p>}
          </div>

          <div>
            <div className="mb-1 text-[13px] text-ink-secondary">{t("bodyMap.title")}</div>
            <BodyMapPicker
              value={bodyMap}
              onChange={setBodyMap}
              locked={isFollowUp}
              frontLabel={t("bodyMap.front")}
              backLabel={t("bodyMap.back")}
            />
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {isFollowUp ? t("incidentForm.saveFollowUp") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
