// Test stand-in for src/lib/gcs.ts (tsconfig.travel-test.json): an in-memory bucket, the helpers unchanged.
export { sanitizeFilename, gcsSize, servedContentType } from "../../src/lib/gcs";
const files = new Map<string, Buffer>();
(globalThis as { __gcsFiles?: Map<string, Buffer> }).__gcsFiles = files;
export const billsBucket = {
  file: (p: string) => ({
    save: async (b: Buffer) => void files.set(p, b),
    delete: async () => void files.delete(p),
    download: async () => [files.get(p) ?? Buffer.alloc(0)] as [Buffer],
    getMetadata: async () => [{ contentType: "application/pdf", size: files.get(p)?.length ?? 0 }],
    exists: async () => [files.has(p)] as [boolean],
  }),
};
