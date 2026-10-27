import "server-only";
import { NextResponse } from "next/server";
import { httpStatusOf } from "@/lib/services/errors";

/** 서비스 함수를 실행하고 결과를 JSON으로, 오류는 코드와 상태로 돌려준다 */
export async function respond<T>(run: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const { status, code } = httpStatusOf(err);
    if (status === 500) console.error(err);
    return NextResponse.json({ error: code }, { status });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
