export type EnvState = "ok" | "missing" | "bad_format" | "password_placeholder" | "wrong_port";

const RULES: Record<string, RegExp> = {
  LIVEKIT_URL: /^wss:\/\/\S+$/,
  NEXT_PUBLIC_LIVEKIT_URL: /^wss:\/\/\S+$/,
  LIVEKIT_API_KEY: /^\S{6,}$/,
  LIVEKIT_API_SECRET: /^\S{16,}$/,
  DATABASE_URL: /^postgres(ql)?:\/\/[^\s:]+:[^\s@]+@[^\s:/]+:\d+\/\S+$/,
};

/** 환경변수가 있는지, 형식이 맞는지만 알려 준다(값은 절대 담지 않는다) */
export function checkEnv(env: Record<string, string | undefined>): Record<string, EnvState> {
  const out: Record<string, EnvState> = {};
  for (const [name, rule] of Object.entries(RULES)) {
    const v = env[name];
    if (!v) out[name] = "missing";
    else if (name === "DATABASE_URL" && v.includes("[YOUR-PASSWORD]")) out[name] = "password_placeholder";
    else if (!rule.test(v)) out[name] = "bad_format";
    else if (name === "DATABASE_URL" && !/:6543\//.test(v)) out[name] = "wrong_port";
    else out[name] = "ok";
  }
  return out;
}
