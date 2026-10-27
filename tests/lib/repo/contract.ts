import type { ShowRepo } from "@/lib/repo/types";

async function donate(repo: ShowRepo, showId: string, memberId: string, amount: number, source: "test" | "adjustment" = "test") {
  const show = (await repo.getShow(showId))!;
  return repo.addDonation({
    showId, seasonId: show.currentSeasonId, episodeId: show.currentEpisodeId!,
    memberId, donorName: "후원자", amount, message: "", source,
  });
}


/** 모든 ShowRepo 구현이 지켜야 할 동작 */
export function repoContract(make: () => ShowRepo) {
  test("쇼를 만들면 시즌 1이 생기고 방장이 1번 멤버다", async () => {
    const repo = make();
    const { show, hostMember } = await repo.createShow({ name: "쇼", mode: "grid", hostName: "방장" });
    expect((await repo.getSeason(show.currentSeasonId)).number).toBe(1);
    expect(hostMember).toMatchObject({
      role: "host", displayName: "방장", joinedOrder: 1, volume: 1,
      onAirMuted: false, manualSeat: null, kicked: false,
    });
    expect(show).toMatchObject({
      name: "쇼", mode: "grid", gridVariant: "grid", onAirLimit: 12, currentEpisodeId: null,
      excludeHostAudio: false, muteWaiting: false, spotlightMemberId: null,
    });
  });
  
  test("멤버는 등록 순서대로 joinedOrder를 받고 개인 비밀값으로 찾을 수 있다", async () => {
    const repo = make();
    const { show } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    const { member, secret } = await repo.createMember(show.id, "멤버A");
    expect(member).toMatchObject({ role: "member", joinedOrder: 2, displayName: "멤버A" });
    expect((await repo.findMemberBySecret(show.id, secret))?.id).toBe(member.id);
    expect(await repo.findMemberBySecret(show.id, "nope")).toBeNull();
    expect((await repo.listMembers(show.id)).map((m) => m.displayName)).toEqual(["방장", "멤버A"]);
  });
  
  test("회차는 현재 시즌 안에서 번호가 오르고, 종료 후 currentEpisodeId가 비워진다", async () => {
    const repo = make();
    const { show } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    const e1 = await repo.startEpisode(show.id);
    expect(e1).toMatchObject({ number: 1, seasonId: show.currentSeasonId, endedAt: null });
    expect((await repo.getShow(show.id))!.currentEpisodeId).toBe(e1.id);
    const ended = await repo.endEpisode(show.id);
    expect(ended?.endedAt).not.toBeNull();
    expect((await repo.getShow(show.id))!.currentEpisodeId).toBeNull();
    expect((await repo.startEpisode(show.id)).number).toBe(2);
  });
  
  test("새 시즌을 시작하면 이전 시즌이 마감되고 회차 번호는 1부터", async () => {
    const repo = make();
    const { show } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    await repo.startEpisode(show.id);
    await repo.endEpisode(show.id);
    const s2 = await repo.startSeason(show.id);
    expect(s2.number).toBe(2);
    expect((await repo.getSeason(show.currentSeasonId)).closedAt).not.toBeNull();
    expect((await repo.getShow(show.id))!.currentSeasonId).toBe(s2.id);
    expect((await repo.startEpisode(show.id)).number).toBe(1);
  });
  
  test("getTotals는 시즌 합계와 회차 합계를 따로 낸다", async () => {
    const repo = make();
    const { show, hostMember } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    await repo.startEpisode(show.id);
    await donate(repo, show.id, hostMember.id, 10000);
    await repo.endEpisode(show.id);
    const e2 = await repo.startEpisode(show.id);
    const last = await donate(repo, show.id, hostMember.id, 20000);
    const totals = await repo.getTotals(show.id, show.currentSeasonId, e2.id);
    expect(totals).toEqual([{ memberId: hostMember.id, season: 30000, episode: 20000, lastDonationAt: last.createdAt }]);
  });
  
  test("후원이 없는 멤버도 합계 0으로 나온다", async () => {
    const repo = make();
    const { show, hostMember } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    expect(await repo.getTotals(show.id, show.currentSeasonId, null)).toEqual([
      { memberId: hostMember.id, season: 0, episode: 0, lastDonationAt: null },
    ]);
  });
  
  test("deleteDonations('test')는 test 출처만 지운다", async () => {
    const repo = make();
    const { show, hostMember } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    await repo.startEpisode(show.id);
    await donate(repo, show.id, hostMember.id, 1000);
    await donate(repo, show.id, hostMember.id, 2000);
    await donate(repo, show.id, hostMember.id, -500, "adjustment");
    expect(await repo.deleteDonations(show.id, "test")).toBe(2);
    const left = await repo.listDonations(show.id, {});
    expect(left.map((d) => d.source)).toEqual(["adjustment"]);
  });
  
  test("updateMember는 지정한 필드만 바꾼다", async () => {
    const repo = make();
    const { show } = await repo.createShow({ name: "쇼", mode: "excel", hostName: "방장" });
    const { member } = await repo.createMember(show.id, "A");
    const u = await repo.updateMember(member.id, { kicked: true, volume: 1.5 });
    expect(u).toMatchObject({ kicked: true, volume: 1.5, displayName: "A", onAirMuted: false });
  });
}
