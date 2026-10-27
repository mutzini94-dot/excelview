import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/server/health";
import { createSupabaseClient } from "@/lib/repo/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 배포 점검용: 환경변수 상태와 DB 연결 여부만 보여 준다 */
export async function GET(req: Request) {
  const env = checkEnv(process.env);
  // ?probe=5 → 같은 연결로 5번 연속 조회한 각각의 시간(첫 연결 비용과 평소 왕복을 구분)
  const probe = Math.min(10, Math.max(1, Number(new URL(req.url).searchParams.get("probe")) || 1));
  let db = "skipped";
  if (env.SUPABASE_URL === "ok" && env.SUPABASE_SERVICE_ROLE_KEY === "ok") {
    try {
      const client = createSupabaseClient();
      const times: number[] = [];
      for (let i = 0; i < probe; i++) {
        const started = Date.now();
        const res = await client.from("shows").select("id").limit(1);
        if (res.error) throw new Error(`error ${res.status}`);
        times.push(Date.now() - started);
      }
      db = `ok ${times.join("/")}ms`;
    } catch (err) {
      db = err instanceof Error && err.message.startsWith("error") ? err.message : "error";
    }
  }
  return NextResponse.json({
    env,
    db,
    region: process.env.VERCEL_REGION ?? "local",
    // 어느 배포가 응답하는지 확인용(값이 아닌 배포 정보만)
    deployment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      envCount: Object.keys(process.env).length,
    },
  });
}
