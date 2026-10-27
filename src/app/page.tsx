import { CreateShowForm } from "./CreateShowForm";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0b0b10] p-6 text-white">
      <div className="text-center">
        <h1 className="text-3xl font-bold">원격 합방 스튜디오</h1>
        <p className="mt-2 text-white/60">각자의 자리에서, 한 화면으로 모여 방송하세요.</p>
      </div>
      <CreateShowForm />
    </main>
  );
}
