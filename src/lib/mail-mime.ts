import crypto from "crypto";

export function encodeHeaderValue(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function chunk76(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

export function newMimeBoundary(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
