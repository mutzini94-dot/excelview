import { readFileSync } from "node:fs";
import { createPostgresRepo, createSql } from "@/lib/repo/postgres";
import { repoContract } from "./contract";

// 실제 DB에 쓰는 테스트라 RUN_DB_TESTS=1 일 때만 돈다: `npm run test:db`
const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("Postgres(직접 연결) 저장소", () => {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = createSql();
  const created: string[] = [];

  afterAll(async () => {
    if (created.length) await sql`delete from shows where id = any(${created})`;
    await sql.end();
  });

  test("없는 쇼 id가 uuid 형식이 아니어도 오류 없이 null", async () => {
    expect(await createPostgresRepo(sql).getShow("not-a-uuid")).toBeNull();
  });

  repoContract(() => {
    const repo = createPostgresRepo(sql);
    const createShow = repo.createShow;
    repo.createShow = async (input) => {
      const out = await createShow(input);
      created.push(out.show.id);
      return out;
    };
    return repo;
  });
});
