import { secretsEqual } from "@/lib/auth/secrets";
import type { ShowRepo } from "@/lib/repo/types";

export type Access =
  | { role: "host" }
  | { role: "operator" }
  | { role: "output" }
  | { role: "invite" }
  | { role: "member"; memberId: string };

export async function resolveAccess(repo: ShowRepo, showId: string, secret: string): Promise<Access | null> {
  if (!secret || !(await repo.getShow(showId))) return null;
  const s = await repo.getSecrets(showId);
  if (secretsEqual(secret, s.host)) return { role: "host" };
  if (secretsEqual(secret, s.operator)) return { role: "operator" };
  if (secretsEqual(secret, s.output)) return { role: "output" };
  if (secretsEqual(secret, s.invite)) return { role: "invite" };
  const member = await repo.findMemberBySecret(showId, secret);
  return member ? { role: "member", memberId: member.id } : null;
}

export function canControl(a: Access | null): boolean {
  return a?.role === "host" || a?.role === "operator";
}
