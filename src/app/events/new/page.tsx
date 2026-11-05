import { redirect } from "next/navigation";

// R4-6 (audit2): there is no separate "new event" page -- the form is on the events list.
export default function NewEventPage() {
  redirect("/events");
}
