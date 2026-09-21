// One place that turns Google API failures (and our own Drive preconditions) into
// stable codes + parameters. Routes return `{ error: code, ...params }`; the UI
// renders `driveSettings.error.<code>` with the params interpolated. Never a
// generic 500 for a known cause, never a raw field name in the message.

export type DriveErrorCode =
  | "not_a_folder_id"
  | "is_a_file"
  | "not_found_or_no_access"
  | "read_only_access"
  | "service_account_no_quota"
  | "storage_quota_exceeded"
  | "token_invalid"
  | "drive_rate_limited"
  | "drive_unavailable"
  | "manifest_missing"
  | "drive_unknown";

/** Non-fatal notices (shown as warnings, never as failures). */
export type DriveWarningCode = "no_connection_fallback" | "token_invalid_fallback" | "user_inactive_fallback" | "same_folder";

export type DriveErrorParams = {
  /** Email of the Google account (or service account) that was used. */
  identity?: string;
  identityKind?: "user" | "service_account";
  /** Service account email, for the messages that tell the user to share with it. */
  serviceAccount?: string;
  folderId?: string;
  /** Which of the event's folders: ingest | export | participants. */
  folderLabel?: string;
};

export class DriveError extends Error {
  code: DriveErrorCode;
  params: DriveErrorParams;
  constructor(code: DriveErrorCode, params: DriveErrorParams = {}, cause?: unknown) {
    super(code);
    this.name = "DriveError";
    this.code = code;
    this.params = params;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** HTTP status a route should answer with for a code. */
export function httpStatusForDriveError(code: DriveErrorCode): number {
  switch (code) {
    case "token_invalid":
      return 409;
    case "drive_rate_limited":
      return 429;
    case "drive_unavailable":
      return 503;
    case "drive_unknown":
      return 502;
    default:
      return 400;
  }
}

// -- reading a Google/Gaxios error ----------------------------------------------

type Facts = { status?: number; reason?: string; message: string; invalidGrant: boolean; network: boolean };

export function readGoogleError(err: unknown): Facts {
  const e = err as {
    code?: number | string;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: string | { message?: string; errors?: { reason?: string }[]; status?: string }; error_description?: string } };
    errors?: { reason?: string }[];
  };
  const data = e?.response?.data;
  const dataError = data?.error;
  const status =
    typeof e?.response?.status === "number"
      ? e.response.status
      : typeof e?.status === "number"
        ? e.status
        : typeof e?.code === "number"
          ? e.code
          : undefined;
  const reason =
    e?.errors?.[0]?.reason ?? (typeof dataError === "object" ? dataError?.errors?.[0]?.reason : undefined);
  const message = `${e?.message ?? ""} ${typeof dataError === "string" ? dataError : (dataError?.message ?? "")} ${data?.error_description ?? ""}`.trim();
  const codeStr = typeof e?.code === "string" ? e.code : "";
  return {
    status,
    reason,
    message,
    invalidGrant: /invalid_grant/i.test(message) || dataError === "invalid_grant",
    network: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|timed out|network/i.test(`${codeStr} ${message}`),
  };
}

/** Worth retrying: rate limiting, Google-side 5xx, network hiccups and our own timeouts. */
export function isTransientGoogleError(err: unknown): boolean {
  if (err instanceof DriveError) return err.code === "drive_rate_limited" || err.code === "drive_unavailable";
  const f = readGoogleError(err);
  if (f.invalidGrant) return false;
  if (f.status === 429 || (f.status !== undefined && f.status >= 500)) return true;
  if (f.status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(f.reason ?? "")) return true;
  return f.status === undefined && f.network;
}

/**
 * Maps a Google/Gaxios error to a DriveError. `purpose` says what was being
 * attempted: a 403 while reading is "no access", while writing it is
 * "read-only" (the folder was visible, we just can't add to it).
 */
export function mapDriveError(err: unknown, ctx: DriveErrorParams & { purpose?: "read" | "write" } = {}): DriveError {
  if (err instanceof DriveError) return err;
  const { purpose = "read", ...params } = ctx;
  const f = readGoogleError(err);
  const isSa = params.identityKind === "service_account";

  if (f.invalidGrant || f.status === 401) return new DriveError("token_invalid", params, err);
  if (f.status === 429 || (f.status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(f.reason ?? ""))) {
    return new DriveError("drive_rate_limited", params, err);
  }
  if (f.status !== undefined && f.status >= 500) return new DriveError("drive_unavailable", params, err);
  if (f.status === undefined && f.network) return new DriveError("drive_unavailable", params, err);

  if (/Service Accounts do not have storage quota/i.test(f.message)) {
    return new DriveError("service_account_no_quota", params, err);
  }
  if (/storage quota has been exceeded|storageQuotaExceeded/i.test(`${f.message} ${f.reason ?? ""}`)) {
    return new DriveError(isSa ? "service_account_no_quota" : "storage_quota_exceeded", params, err);
  }
  if (f.status === 404) return new DriveError("not_found_or_no_access", params, err);
  if (f.status === 403) {
    return new DriveError(purpose === "write" ? "read_only_access" : "not_found_or_no_access", params, err);
  }
  return new DriveError("drive_unknown", params, err);
}

// -- folder ids ------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_-]{10,}$/;

/**
 * Accepts a bare folder id or a pasted Drive folder URL (`/folders/<id>`,
 * `?id=<id>`), returns the id, or null when it isn't recognisably one.
 */
export function parseFolderId(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;
  const fromPath = text.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (fromPath) return ID_RE.test(fromPath[1]) ? fromPath[1] : null;
  const fromQuery = text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (fromQuery) return ID_RE.test(fromQuery[1]) ? fromQuery[1] : null;
  return ID_RE.test(text) ? text : null;
}
