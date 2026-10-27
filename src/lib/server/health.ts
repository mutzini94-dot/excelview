export type EnvState = "ok" | "missing" | "bad_format" | "wrong_key_type";

const RULES: Record<string, RegExp> = {
  LIVEKIT_URL: /^wss:\/\/\S+$/,
  NEXT_PUBLIC_LIVEKIT_URL: /^wss:\/\/\S+$/,
  LIVEKIT_API_KEY: /^\S{6,}$/,
  LIVEKIT_API_SECRET: /^\S{16,}$/,
  SUPABASE_URL: /^https:\/\/\S+\.supabase\.co\/?$/,
  SUPABASE_SERVICE_ROLE_KEY: /^(sb_secret_\S+|eyJ\S+)$/,
};

/** 환경변수가 있는지, 형식이 맞는지만 알려 준다(값은 절대 담지 않는다) */
export function checkEnv(env: Record<string, string | undefined>): Record<string, EnvState> {
  const out: Record<string, EnvState> = {};
  for (const [name, rule] of Object.entries(RULES)) {
    const v = env[name];
    if (!v) out[name] = "missing";
    else if (name === "SUPABASE_SERVICE_ROLE_KEY" && v.startsWith("sb_publishable_")) out[name] = "wrong_key_type";
    else out[name] = rule.test(v) ? "ok" : "bad_format";
  }
  return out;
}
