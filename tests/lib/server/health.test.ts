import { checkEnv } from "@/lib/server/health";

const good = {
  LIVEKIT_URL: "wss://x.livekit.cloud",
  NEXT_PUBLIC_LIVEKIT_URL: "wss://x.livekit.cloud",
  LIVEKIT_API_KEY: "APIabc123",
  LIVEKIT_API_SECRET: "s".repeat(40),
  DATABASE_URL: "postgresql://postgres.abc:pw123@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres",
};

test("모두 올바르면 전부 ok", () => {
  expect(Object.values(checkEnv(good)).every((v) => v === "ok")).toBe(true);
});

test("빠진 값은 missing, 형식이 틀린 값은 bad_format", () => {
  const r = checkEnv({ ...good, DATABASE_URL: undefined, LIVEKIT_URL: "https://x.livekit.cloud" });
  expect(r.DATABASE_URL).toBe("missing");
  expect(r.LIVEKIT_URL).toBe("bad_format");
});

test("DATABASE_URL에 [YOUR-PASSWORD]가 남아 있으면 password_placeholder", () => {
  const url = "postgresql://postgres.abc:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";
  expect(checkEnv({ ...good, DATABASE_URL: url }).DATABASE_URL).toBe("password_placeholder");
});

test("DATABASE_URL이 6543(Transaction pooler)이 아니면 wrong_port", () => {
  const url = "postgresql://postgres.abc:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";
  expect(checkEnv({ ...good, DATABASE_URL: url }).DATABASE_URL).toBe("wrong_port");
});

test("값 앞뒤 따옴표나 공백이 섞이면 bad_format", () => {
  expect(checkEnv({ ...good, DATABASE_URL: `"${good.DATABASE_URL}"` }).DATABASE_URL).toBe("bad_format");
  expect(checkEnv({ ...good, LIVEKIT_API_KEY: "APIabc123 " }).LIVEKIT_API_KEY).toBe("bad_format");
});

test("결과에는 비밀값이 들어가지 않는다", () => {
  expect(JSON.stringify(checkEnv(good))).not.toContain("pw123");
});
