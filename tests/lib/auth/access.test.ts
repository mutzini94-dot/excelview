import { canControl, resolveAccess } from "@/lib/auth/access";
import { newSecret } from "@/lib/auth/secrets";
import { createMemoryRepo } from "@/lib/repo/memory";

async function setup() {
  const repo = createMemoryRepo();
  const created = await repo.createShow({ name: "테스트쇼", mode: "excel", hostName: "방장" });
  return { repo, ...created };
}

test("비밀값마다 역할이 구분된다", async () => {
  const { repo, show, secrets, hostMember, hostMemberSecret } = await setup();
  expect(await resolveAccess(repo, show.id, secrets.host)).toEqual({ role: "host" });
  expect(await resolveAccess(repo, show.id, secrets.operator)).toEqual({ role: "operator" });
  expect(await resolveAccess(repo, show.id, secrets.output)).toEqual({ role: "output" });
  expect(await resolveAccess(repo, show.id, secrets.invite)).toEqual({ role: "invite" });
  expect(await resolveAccess(repo, show.id, hostMemberSecret)).toEqual({ role: "member", memberId: hostMember.id });
  expect(await resolveAccess(repo, show.id, "wrong")).toBeNull();
});

test("다른 쇼의 비밀값은 통하지 않는다", async () => {
  const { repo, secrets } = await setup();
  const other = await repo.createShow({ name: "다른쇼", mode: "grid", hostName: "방장2" });
  expect(await resolveAccess(repo, other.show.id, secrets.host)).toBeNull();
});

test("없는 쇼는 null", async () => {
  const { repo, secrets } = await setup();
  expect(await resolveAccess(repo, "no-such-show", secrets.host)).toBeNull();
});

test("재발급한 방장 비밀값만 통한다", async () => {
  const { repo, show, secrets } = await setup();
  const fresh = await repo.rotateSecret(show.id, "host");
  expect(fresh).not.toBe(secrets.host);
  expect(await resolveAccess(repo, show.id, secrets.host)).toBeNull();
  expect(await resolveAccess(repo, show.id, fresh)).toEqual({ role: "host" });
});

test("canControl은 host와 operator만 true", () => {
  expect(canControl({ role: "host" })).toBe(true);
  expect(canControl({ role: "operator" })).toBe(true);
  expect(canControl({ role: "output" })).toBe(false);
  expect(canControl({ role: "invite" })).toBe(false);
  expect(canControl({ role: "member", memberId: "m" })).toBe(false);
  expect(canControl(null)).toBe(false);
});

test("newSecret은 32바이트 base64url이고 매번 다르다", () => {
  const a = newSecret();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newSecret()).not.toBe(a);
});
