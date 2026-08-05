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
      const data = await res.json();
      setError(data.error || t("events.errorDeleteFailed"));
      return;
    }
    loadEvents();
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>{t("events.title")}</h1>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={t("events.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4 }}>
          {t("events.submit")}
        </button>
      </form>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : events.length === 0 ? (
        <p>{t("events.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>{t("events.colName")}</th>
              <th style={{ padding: "0.5rem" }}>{t("events.colFrom")}</th>
              <th style={{ padding: "0.5rem" }}>{t("events.colTo")}</th>
              <th style={{ padding: "0.5rem" }}>{t("common.status")}</th>
              <th style={{ padding: "0.5rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  <a href={`/events/${ev.id}`} style={{ color: "#111", textDecoration: "underline" }}>
                    {ev.name}
                  </a>
                </td>
                <td style={{ padding: "0.5rem" }}>{new Date(ev.startDate).toLocaleDateString("cs-CZ")}</td>
                <td style={{ padding: "0.5rem" }}>{new Date(ev.endDate).toLocaleDateString("cs-CZ")}</td>
                <td style={{ padding: "0.5rem" }}>
                  {ev.status === "active" ? t("common.statusActive") : t("common.statusClosed")}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <button
                    onClick={() => handleDelete(ev.id, ev.name)}
                    style={{ color: "#c00", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
