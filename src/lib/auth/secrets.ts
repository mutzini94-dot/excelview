import { randomBytes, timingSafeEqual } from "node:crypto";

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
