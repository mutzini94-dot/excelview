import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { createSql } from "@/lib/repo/postgres";
import { checkEnv } from "@/lib/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let sql: Sql | null = null;

/** 배포 점검용: 환경변수 상태와 DB 연결 여부만 보여 준다 */
export async function GET(req: Request) {
  const env = checkEnv(process.env);
  // ?probe=5 → 같은 연결로 5번 연속 조회한 각각의 시간(첫 연결 비용과 평소 왕복을 구분)
  const probe = Math.min(10, Math.max(1, Number(new URL(req.url).searchParams.get("probe")) || 1));
  let db = "skipped";
  if (env.DATABASE_URL === "ok") {
    try {
      sql ??= createSql();
      const times: number[] = [];
      for (let i = 0; i < probe; i++) {
        const started = Date.now();
        await sql`select 1 from shows limit 1`;
        times.push(Date.now() - started);
      }
      db = `ok ${times.join("/")}ms`;
    } catch (err) {
      // 오류 코드와 메시지만 보여 준다. 메시지 속 사용자 이름은 가린다(비밀번호는 메시지에 없다)
      const e = err as { code?: string; message?: string };
      const message = (e.message ?? "").replace(/postgres\.[a-z0-9]+/gi, "postgres.<ref>").slice(0, 120);
      db = `error ${e.code ?? "unknown"}: ${message}`;
    }
  }
  // 접속하려는 서버 이름과 사용자 이름 형태(비밀값 아님)
  const target = process.env.DATABASE_URL?.match(/^postgres(?:ql)?:\/\/([^:]+):[^@]*@([^:/]+):(\d+)/);
  const dbTarget = target
    ? { host: target[2], port: target[3], userLooksLikeExample: target[1] === "postgres.abcdefgh" }
    : null;
  return NextResponse.json({
    env,
    db,
    dbTarget,
    region: process.env.VERCEL_REGION ?? "local",
    deployment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
  });
}
