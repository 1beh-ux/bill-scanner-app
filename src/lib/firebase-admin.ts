import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";

export function initAdmin() {
  if (getApps().length) return;
  initializeApp({ credential: applicationDefault() });
}
