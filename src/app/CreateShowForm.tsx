"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShowMode } from "@/lib/domain/types";

const ERROR_TEXT: Record<string, string> = {
  INVALID_NAME: "방 이름은 1~40자, 닉네임은 1~20자로 입력해 주세요.",
  INVALID_MODE: "모드를 선택해 주세요.",
};

export function CreateShowForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hostName, setHostName] = useState("");
  const [mode, setMode] = useState<ShowMode>("excel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mode, hostName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_TEXT[data.error] ?? "방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      router.push(data.createdUrl);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const modeButton = (value: ShowMode, title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex-1 rounded-xl border-2 p-4 text-left transition ${
        mode === value ? "border-violet-500 bg-violet-500/10" : "border-white/10 hover:border-white/30"
      }`}
    >
      <div className="font-bold">{title}</div>
      <div className="text-sm text-white/60">{desc}</div>
    </button>
  );

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-sm text-white/70">방 이름</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="예) 금요 엑셀방송"
          className="rounded-lg bg-white/5 px-4 py-3 outline-none ring-violet-500 focus:ring-2"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-white/70">방장 닉네임</span>
        <input
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          maxLength={20}
          placeholder="방송에 표시될 이름"
          className="rounded-lg bg-white/5 px-4 py-3 outline-none ring-violet-500 focus:ring-2"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-white/70">모드</span>
        <div className="flex gap-3">
          {modeButton("excel", "엑셀 모드", "후원 순위로 자리와 직급이 바뀜")}
          {modeButton("grid", "일반 합방", "모두 같은 크기, 필요할 때 강조")}
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-violet-600 py-4 text-lg font-bold transition hover:bg-violet-500 disabled:opacity-50"
      >
        {busy ? "만드는 중…" : "방 만들기"}
      </button>
    </form>
  );
}
