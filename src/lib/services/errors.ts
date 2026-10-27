/** 서비스 함수가 던지는 오류 코드. API 라우트가 HTTP 상태로 바꾼다. */
export type ErrorCode =
  | "FORBIDDEN" | "NOT_FOUND" | "NAME_TAKEN" | "NO_EPISODE" | "INVALID_STATE"
  | "INVALID_NAME" | "INVALID_MODE" | "INVALID_TARGET" | "INVALID_AMOUNT" | "INVALID_LIMIT" | "INVALID_VOLUME"
  | "INVALID_INPUT";

export function fail(code: ErrorCode): never {
  throw new Error(code);
}

export function httpStatusOf(err: unknown): { status: number; code: string } {
  const code = err instanceof Error ? err.message.split(":")[0] : "";
  if (code === "FORBIDDEN") return { status: 403, code };
  if (code === "NOT_FOUND") return { status: 404, code };
  if (code === "NO_EPISODE" || code === "INVALID_STATE") return { status: 409, code };
  if (code === "NAME_TAKEN" || code.startsWith("INVALID_")) return { status: 400, code };
  return { status: 500, code: "SERVER_ERROR" };
}

/** 앞뒤 공백을 지우고 길이를 검사한다 */
export function cleanText(value: unknown, min: number, max: number, code: ErrorCode): string {
  const s = typeof value === "string" ? value.trim() : "";
  if ([...s].length < min || [...s].length > max) fail(code);
  return s;
}
