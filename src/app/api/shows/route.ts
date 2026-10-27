import { readJson, respond } from "@/lib/server/respond";
import { serverDeps } from "@/lib/server/deps";
import type { ShowMode } from "@/lib/domain/types";
import { createShow } from "@/lib/services/shows";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(async () => {
    const { showId, links } = await createShow(serverDeps(), {
      name: String(body.name ?? ""),
      mode: body.mode as ShowMode,
      hostName: String(body.hostName ?? ""),
    });
    return { showId, createdUrl: `/s/${showId}/created/${links.host.split("/").pop()}` };
  });
}
