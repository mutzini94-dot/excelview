import { notFound } from "next/navigation";
import { serverDeps } from "@/lib/server/deps";
import { getLinks } from "@/lib/services/shows";
import { LinkCard } from "./LinkCard";

export const dynamic = "force-dynamic";

export default async function CreatedPage({ params }: { params: Promise<{ showId: string; hostSecret: string }> }) {
  const { showId, hostSecret } = await params;
  const deps = serverDeps();
  const links = await getLinks(deps, showId, hostSecret);
  if (!links) notFound();
  const show = (await deps.repo.getShow(showId))!;

  return (
    <main className="min-h-screen bg-[#0b0b10] p-4 text-white sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header>
          <p className="text-sm text-white/50">{show.mode === "excel" ? "엑셀 모드" : "일반 합방"}</p>
          <h1 className="text-2xl font-bold">{show.name}</h1>
        </header>
        <p className="rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
          이 페이지 주소를 즐겨찾기 하세요. 잃어버리면 콘솔에 들어올 수 없습니다.
        </p>
        <LinkCard accent title="방장 콘솔" desc="방송을 진행하는 조작 화면입니다. 휴대폰이나 보조 모니터로 열어도 됩니다." path={links.host} />
        <LinkCard accent title="방장 출연" desc="방장이 카메라에 나올 때 여는 화면입니다." path={links.hostStage} />
        <LinkCard title="멤버에게 보내기" desc="멤버가 이 링크로 닉네임을 등록하고 입장합니다." path={links.invite} />
        <LinkCard title="OBS에 넣기" desc="OBS 브라우저 소스에 넣는 방송 화면입니다(1920×1080)." path={links.output} />
        <LinkCard title="보조 운영자에게 주기" desc="콘솔과 같은 조작을 할 수 있는 링크입니다. 출연하지 않습니다." path={links.operator} />
      </div>
    </main>
  );
}
