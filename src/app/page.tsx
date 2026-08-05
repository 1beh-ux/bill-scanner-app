"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Ev = { id: string; status: string };

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function go() {
      try {
        const r = await fetch("/api/events");
        const evs: Ev[] = r.ok ? await r.json() : [];
        const act = evs.find((e) => e.status === "active") || evs[0];
        router.replace(act ? "/events/" + act.id + "/bills" : "/events");
      } catch {
        router.replace("/events");
      }
    }
    go();
  }, [router]);

  return <div style={{ padding: "2rem" }} />;
}
