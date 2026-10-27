import { readFileSync } from "node:fs";
import { createSupabaseClient, createSupabaseRepo } from "@/lib/repo/supabase";
import { repoContract } from "./contract";

// 실제 Supabase에 쓰는 테스트라 RUN_DB_TESTS=1 일 때만 돈다: `npm run test:db`
const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("Supabase 저장소", () => {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const db = createSupabaseClient();
  const created: string[] = [];

  afterAll(async () => {
    if (created.length) await db.from("shows").delete().in("id", created);
  });

  repoContract(() => {
    const repo = createSupabaseRepo(db);
    const createShow = repo.createShow;
    repo.createShow = async (input) => {
      const out = await createShow(input);
      created.push(out.show.id);
      return out;
    };
    return repo;
  });
});
