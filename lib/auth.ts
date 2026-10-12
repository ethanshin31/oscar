import { createHash, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "oscar_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function accessCode(): string {
  const code = process.env.OSCAR_ACCESS_CODE;
  if (!code) throw new Error("OSCAR_ACCESS_CODE is not set");
  return code;
}

/** The cookie value for a signed-in device. Changing OSCAR_ACCESS_CODE signs every device out. */
export function sessionToken(): string {
  return createHash("sha256").update(`oscar-session:${accessCode()}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isValidCode(code: string): boolean {
  return safeEqual(code, accessCode());
}

export function isValidSession(token: string | undefined): boolean {
  return !!token && safeEqual(token, sessionToken());
}
