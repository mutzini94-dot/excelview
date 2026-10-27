import { checkEnv } from "@/lib/server/health";

const good = {
  LIVEKIT_URL: "wss://x.livekit.cloud",
  NEXT_PUBLIC_LIVEKIT_URL: "wss://x.livekit.cloud",
  LIVEKIT_API_KEY: "APIabc123",
  LIVEKIT_API_SECRET: "s".repeat(40),
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "k".repeat(30),
};

test("모두 올바르면 전부 ok", () => {
  expect(Object.values(checkEnv(good)).every((v) => v === "ok")).toBe(true);
});

test("빠진 값은 missing, 형식이 틀린 값은 bad_format", () => {
  const r = checkEnv({ ...good, SUPABASE_URL: undefined, LIVEKIT_URL: "https://x.livekit.cloud" });
  expect(r.SUPABASE_URL).toBe("missing");
  expect(r.LIVEKIT_URL).toBe("bad_format");
});

test("Supabase 공개용(publishable) 키는 wrong_key_type", () => {
  expect(checkEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_" + "k".repeat(30) }).SUPABASE_SERVICE_ROLE_KEY).toBe("wrong_key_type");
});

test("값 앞뒤 따옴표나 공백이 섞이면 bad_format", () => {
  expect(checkEnv({ ...good, SUPABASE_URL: '"https://abc.supabase.co"' }).SUPABASE_URL).toBe("bad_format");
  expect(checkEnv({ ...good, LIVEKIT_API_KEY: "APIabc123 " }).LIVEKIT_API_KEY).toBe("bad_format");
});

test("결과에는 비밀값이 들어가지 않는다", () => {
  expect(JSON.stringify(checkEnv(good))).not.toContain("sb_secret_");
});
