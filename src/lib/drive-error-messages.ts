// Client-side rendering of the stable Drive error codes (src/lib/drive-errors.ts):
// `driveSettings.error.<code>` with the identity / folder / service account filled
// in. Unknown codes fall back to the generic "unexpected Google error" text, never
// to a raw key.
type T = (key: string, vars?: Record<string, string>) => string;

export type DriveErrorInfo = {
  identity?: string;
  serviceAccount?: string;
  folderId?: string;
  folderLabel?: string;
};

export function driveErrorText(t: T, code: string, info: DriveErrorInfo = {}): string {
  const key = `driveSettings.error.${code}`;
  const text = t(key, {
    identity: info.identity ?? "",
    serviceAccount: info.serviceAccount ?? "",
    folderId: info.folderId ?? "",
    folder: info.folderLabel ? t(`driveSettings.folder.${info.folderLabel}`) : t("driveSettings.folder.generic"),
  });
  return text === key ? t("driveSettings.error.drive_unknown") : text;
}
