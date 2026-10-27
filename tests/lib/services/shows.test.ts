import { resolveAccess } from "@/lib/auth/access";
import { createMemoryRepo } from "@/lib/repo/memory";
import { createShow, getLinks } from "@/lib/services/shows";

const deps = () => ({ repo: createMemoryRepo() });

test("링크 5종이 각자의 역할 비밀값을 담는다", async () => {
  const d = deps();
  const { showId, links } = await createShow(d, { name: "엑셀쇼", mode: "excel", hostName: "방장" });
  const secretOf = (path: string) => path.split("/").pop()!;
  expect(links.host).toMatch(new RegExp(`^/s/${showId}/host/[A-Za-z0-9_-]{43}$`));
  expect(links.operator).toMatch(new RegExp(`^/s/${showId}/host/[A-Za-z0-9_-]{43}$`));
  expect(links.output).toMatch(new RegExp(`^/s/${showId}/out/[A-Za-z0-9_-]{43}$`));
  expect(links.invite).toMatch(new RegExp(`^/s/${showId}/join/[A-Za-z0-9_-]{43}$`));
  expect(links.hostStage).toMatch(new RegExp(`^/s/${showId}/m/[A-Za-z0-9_-]{43}$`));
  expect(await resolveAccess(d.repo, showId, secretOf(links.host))).toEqual({ role: "host" });
  expect(await resolveAccess(d.repo, showId, secretOf(links.operator))).toEqual({ role: "operator" });
  expect(await resolveAccess(d.repo, showId, secretOf(links.output))).toEqual({ role: "output" });
  expect(await resolveAccess(d.repo, showId, secretOf(links.invite))).toEqual({ role: "invite" });
  expect((await resolveAccess(d.repo, showId, secretOf(links.hostStage)))?.role).toBe("member");
});

test("이름 앞뒤 공백은 지우고 저장한다", async () => {
  const d = deps();
  const { showId } = await createShow(d, { name: "  엑셀쇼  ", mode: "grid", hostName: " 방장 " });
  expect((await d.repo.getShow(showId))?.name).toBe("엑셀쇼");
  expect((await d.repo.listMembers(showId))[0].displayName).toBe("방장");
});

test("방 이름이 비었거나 40자를 넘으면 INVALID_NAME", async () => {
  await expect(createShow(deps(), { name: "   ", mode: "excel", hostName: "방장" })).rejects.toThrow("INVALID_NAME");
  await expect(createShow(deps(), { name: "가".repeat(41), mode: "excel", hostName: "방장" })).rejects.toThrow("INVALID_NAME");
  await expect(createShow(deps(), { name: "가".repeat(40), mode: "excel", hostName: "방장" })).resolves.toBeTruthy();
});

test("방장 닉네임이 비었거나 20자를 넘으면 INVALID_NAME", async () => {
  await expect(createShow(deps(), { name: "쇼", mode: "excel", hostName: "" })).rejects.toThrow("INVALID_NAME");
  await expect(createShow(deps(), { name: "쇼", mode: "excel", hostName: "가".repeat(21) })).rejects.toThrow("INVALID_NAME");
});

test("모드가 excel/grid가 아니면 INVALID_MODE", async () => {
  // @ts-expect-error 잘못된 모드를 일부러 넣는다
  await expect(createShow(deps(), { name: "쇼", mode: "dance", hostName: "방장" })).rejects.toThrow("INVALID_MODE");
});

test("getLinks는 방장 비밀값일 때만 링크를 돌려준다", async () => {
  const d = deps();
  const { showId, links } = await createShow(d, { name: "쇼", mode: "excel", hostName: "방장" });
  const hostSecret = links.host.split("/").pop()!;
  const operatorSecret = links.operator.split("/").pop()!;
  expect(await getLinks(d, showId, hostSecret)).toEqual(links);
  expect(await getLinks(d, showId, operatorSecret)).toBeNull();
  expect(await getLinks(d, showId, "wrong")).toBeNull();
});
