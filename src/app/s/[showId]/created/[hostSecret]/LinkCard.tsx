"use client";

import { useEffect, useRef, useState } from "react";

export function LinkCard({ title, desc, path, accent }: { title: string; desc: string; path: string; accent?: boolean }) {
  const [origin, setOrigin] = useState("");
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin + path;

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // 클립보드 권한이 막힌 환경: 입력칸을 선택해 예전 방식으로 복사를 시도한다
      inputRef.current?.select();
      ok = document.execCommand?.("copy") ?? false;
    }
    setState(ok ? "copied" : "manual");
    setTimeout(() => setState("idle"), ok ? 1500 : 4000);
  }

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 ${accent ? "border-violet-500/60 bg-violet-500/10" : "border-white/10 bg-white/5"}`}>
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-sm text-white/60">{desc}</div>
      </div>
      <div className="flex gap-2">
        <input ref={inputRef} readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-white/70" />
        <button onClick={copy} className="min-h-12 shrink-0 rounded-lg bg-violet-600 px-4 font-bold hover:bg-violet-500">
          {state === "copied" ? "복사됨" : "복사"}
        </button>
      </div>
      {state === "manual" && (
        <p className="text-sm text-amber-300">자동 복사가 막혀 있습니다. 주소가 선택되어 있으니 Ctrl+C로 복사해 주세요.</p>
      )}
    </div>
  );
}
