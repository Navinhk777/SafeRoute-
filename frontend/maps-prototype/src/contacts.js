// Trusted contacts are saved in the browser by the SOS feature (SOS.jsx).
// This file lets other screens read the same list.

const STORAGE_KEY = "saferoute.trustedContacts";

export function readContacts() {
  try {
    const contacts = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(contacts) ? contacts : [];
  } catch {
    return [];
  }
}

export function normalizePhone(phone) {
  const trimmed = String(phone).trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}
