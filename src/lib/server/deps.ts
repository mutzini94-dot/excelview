import "server-only";
import { createPostgresRepo } from "@/lib/repo/postgres";
import type { ShowRepo } from "@/lib/repo/types";

let repo: ShowRepo | null = null;

/** 서버(API, 서버 컴포넌트)에서 쓰는 실제 의존성 */
export function serverDeps(): { repo: ShowRepo } {
  repo ??= createPostgresRepo();
  return { repo };
}
