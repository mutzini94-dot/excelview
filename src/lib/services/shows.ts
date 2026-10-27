import { resolveAccess } from "@/lib/auth/access";
import type { ShowMode } from "@/lib/domain/types";
import type { ShowRepo, ShowSecrets } from "@/lib/repo/types";
import { cleanText, fail } from "@/lib/services/errors";

/** 경로만 담는다(도메인 제외) */
export interface ShowLinks {
  host: string;
  operator: string;
  output: string;
  invite: string;
  hostStage: string;
}

function buildLinks(showId: string, s: ShowSecrets, hostMemberSecret: string): ShowLinks {
  return {
    host: `/s/${showId}/host/${s.host}`,
    operator: `/s/${showId}/host/${s.operator}`,
    output: `/s/${showId}/out/${s.output}`,
    invite: `/s/${showId}/join/${s.invite}`,
    hostStage: `/s/${showId}/m/${hostMemberSecret}`,
  };
}

export async function createShow(
  deps: { repo: ShowRepo },
  input: { name: string; mode: ShowMode; hostName: string },
): Promise<{ showId: string; links: ShowLinks }> {
  const name = cleanText(input.name, 1, 40, "INVALID_NAME");
  const hostName = cleanText(input.hostName, 1, 20, "INVALID_NAME");
  if (input.mode !== "excel" && input.mode !== "grid") fail("INVALID_MODE");
  const { show, secrets, hostMemberSecret } = await deps.repo.createShow({ name, mode: input.mode, hostName });
  return { showId: show.id, links: buildLinks(show.id, secrets, hostMemberSecret) };
}

export async function getLinks(deps: { repo: ShowRepo }, showId: string, hostSecret: string): Promise<ShowLinks | null> {
  if ((await resolveAccess(deps.repo, showId, hostSecret))?.role !== "host") return null;
  const secrets = await deps.repo.getSecrets(showId);
  const host = (await deps.repo.listMembers(showId)).find((m) => m.role === "host");
  if (!host) return null;
  return buildLinks(showId, secrets, await deps.repo.getMemberSecret(host.id));
}
