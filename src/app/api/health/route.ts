import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/server/health";
import { createSupabaseClient } from "@/lib/repo/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 배포 점검용: 환경변수 상태와 DB 연결 여부만 보여 준다 */
export async function GET() {
  const env = checkEnv(process.env);
  let db = "skipped";
  if (env.SUPABASE_URL === "ok" && env.SUPABASE_SERVICE_ROLE_KEY === "ok") {
    const started = Date.now();
    try {
      const res = await createSupabaseClient().from("shows").select("id", { head: true, count: "exact" });
      db = res.error ? `error ${res.status}` : `ok ${Date.now() - started}ms`;
    } catch {
      db = "error";
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
