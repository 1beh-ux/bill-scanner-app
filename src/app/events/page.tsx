"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type EventItem = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "closed";
};

const inputClass =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function EventsPage() {
  const { t } = useTranslations();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    const res = await fetch("/api/events");
    if (res.ok) {
      setEvents(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !startDate || !endDate) {
      setError(t("events.errorFillAll"));
      return;
    }

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startDate, endDate }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("events.errorCreateFailed"));
      return;
    }

    setName("");
    setStartDate("");
    setEndDate("");
    loadEvents();
  }

  async function handleDelete(id: string, eventName: string) {
    if (!window.confirm(t("events.confirmDelete", { name: eventName }))) return;

    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "event_has_bills") {
        setError(t("events.error.event_has_bills", { count: String(data.billCount) }));
      } else if (data.error === "event_has_dependencies") {
        setError(t("events.error.event_has_dependencies"));
      } else {
        setError(t("events.errorDeleteFailed"));
      }
      return;
    }
    loadEvents();
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("events.title")}</h1>

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder={t("events.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={inputClass}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover"
        >
          {t("events.submit")}
        </button>
      </form>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : events.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("events.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("events.colName")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("events.colFrom")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("events.colTo")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.status")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-mist/60">
                  <td className="p-2 text-[14px]">
                    <a href={`/events/${ev.id}`} className="text-ink underline hover:text-ember">
                      {ev.name}
                    </a>
                  </td>
                  <td className="p-2 text-[14px] text-ink-secondary">
                    {new Date(ev.startDate).toLocaleDateString("cs-CZ")}
                  </td>
                  <td className="p-2 text-[14px] text-ink-secondary">
                    {new Date(ev.endDate).toLocaleDateString("cs-CZ")}
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] " +
                        (ev.status === "active" ? "bg-pine-bg text-pine" : "bg-mist text-ink-secondary")
                      }
                    >
                      {ev.status === "active" ? t("common.statusActive") : t("common.statusClosed")}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => handleDelete(ev.id, ev.name)}
                      className="text-[13px] text-red-600 hover:underline"
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
