import { randomUUID } from "node:crypto";
import { newSecret, secretsEqual } from "@/lib/auth/secrets";
import type { Donation, Episode, Member, Season, Show } from "@/lib/domain/types";
import { sumTotals, type ShowRepo, type ShowSecrets } from "@/lib/repo/types";

/** 테스트용 메모리 저장소 */
export function createMemoryRepo(): ShowRepo {
  const shows = new Map<string, Show>();
  const secrets = new Map<string, ShowSecrets>();
  const members = new Map<string, Member>();
  const memberSecrets = new Map<string, string>(); // memberId → secret
  const seasons = new Map<string, Season>();
  const episodes = new Map<string, Episode>();
  let donations: Donation[] = [];
  let lastTime = 0;

  // 같은 밀리초에 여러 건이 들어와도 순서가 유지되도록 시각을 단조 증가시킨다
  const now = () => {
    lastTime = Math.max(Date.now(), lastTime + 1);
    return new Date(lastTime).toISOString();
  };
  const must = <T>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new Error(`NOT_FOUND: ${what}`);
    return v;
  };
  const showOf = (id: string) => must(shows.get(id), "show");
  const membersOf = (showId: string) =>
    [...members.values()].filter((m) => m.showId === showId).sort((a, b) => a.joinedOrder - b.joinedOrder);

  const repo: ShowRepo = {
    async createShow({ name, mode, hostName }) {
      const id = randomUUID();
      const season: Season = { id: randomUUID(), showId: id, number: 1, closedAt: null };
      seasons.set(season.id, season);
      const show: Show = {
        id, name, mode, gridVariant: "grid", onAirLimit: 12, excludeHostAudio: false, muteWaiting: false,
        spotlightMemberId: null, currentSeasonId: season.id, currentEpisodeId: null,
      };
      shows.set(id, show);
      const s: ShowSecrets = { host: newSecret(), operator: newSecret(), output: newSecret(), invite: newSecret() };
      secrets.set(id, s);
      const { member, secret } = await repo.createMember(id, hostName);
      const hostMember = { ...member, role: "host" as const };
      members.set(hostMember.id, hostMember);
      return { show: { ...show }, secrets: { ...s }, hostMember: { ...hostMember }, hostMemberSecret: secret };
    },
    async getShow(showId) {
      const s = shows.get(showId);
      return s ? { ...s } : null;
    },
    async updateShow(showId, patch) {
      const s = { ...showOf(showId), ...patch };
      shows.set(showId, s);
      return { ...s };
    },
    async getSecrets(showId) {
      return { ...must(secrets.get(showId), "show") };
    },
    async rotateSecret(showId, kind) {
      const s = must(secrets.get(showId), "show");
      const fresh = newSecret();
      secrets.set(showId, { ...s, [kind]: fresh });
      return fresh;
    },
    async findMemberBySecret(showId, secret) {
      for (const m of membersOf(showId)) {
        if (secretsEqual(secret, memberSecrets.get(m.id)!)) return { ...m };
      }
      return null;
    },
    async getMemberSecret(memberId) {
      return must(memberSecrets.get(memberId), "member");
    },
    async createMember(showId, displayName) {
      showOf(showId);
      const member: Member = {
        id: randomUUID(), showId, displayName, role: "member", kicked: false, onAirMuted: false,
        volume: 1, manualSeat: null, joinedOrder: membersOf(showId).length + 1,
      };
      const secret = newSecret();
      members.set(member.id, member);
      memberSecrets.set(member.id, secret);
      return { member: { ...member }, secret };
    },
    async listMembers(showId) {
      return membersOf(showId).map((m) => ({ ...m }));
    },
    async updateMember(memberId, patch) {
      const m = { ...must(members.get(memberId), "member"), ...patch };
      members.set(memberId, m);
      return { ...m };
    },
    async addDonation(d) {
      const donation: Donation = { ...d, id: randomUUID(), createdAt: now() };
      donations.push(donation);
      return { ...donation };
    },
    async listDonations(showId, { seasonId, episodeId }) {
      return donations
        .filter((d) => d.showId === showId && (!seasonId || d.seasonId === seasonId) && (!episodeId || d.episodeId === episodeId))
        .map((d) => ({ ...d }));
    },
    async deleteDonations(showId, source) {
      const before = donations.length;
      donations = donations.filter((d) => !(d.showId === showId && d.source === source));
      return before - donations.length;
    },
    async getTotals(showId, seasonId, episodeId) {
      return sumTotals(membersOf(showId), await repo.listDonations(showId, { seasonId }), episodeId);
    },
    async getSeason(seasonId) {
      return { ...must(seasons.get(seasonId), "season") };
    },
    async listSeasons(showId) {
      return [...seasons.values()].filter((s) => s.showId === showId).sort((a, b) => a.number - b.number);
    },
    async startSeason(showId) {
      const show = showOf(showId);
      const prev = must(seasons.get(show.currentSeasonId), "season");
      seasons.set(prev.id, { ...prev, closedAt: now() });
      const next: Season = { id: randomUUID(), showId, number: prev.number + 1, closedAt: null };
      seasons.set(next.id, next);
      shows.set(showId, { ...show, currentSeasonId: next.id });
      return { ...next };
    },
    async getEpisode(episodeId) {
      return { ...must(episodes.get(episodeId), "episode") };
    },
    async listEpisodes(showId, seasonId) {
      return [...episodes.values()]
        .filter((e) => e.showId === showId && e.seasonId === seasonId)
        .sort((a, b) => a.number - b.number);
    },
    async startEpisode(showId) {
      const show = showOf(showId);
      const count = (await repo.listEpisodes(showId, show.currentSeasonId)).length;
      const ep: Episode = {
        id: randomUUID(), showId, seasonId: show.currentSeasonId, number: count + 1, startedAt: now(), endedAt: null,
      };
      episodes.set(ep.id, ep);
      shows.set(showId, { ...show, currentEpisodeId: ep.id });
      return { ...ep };
    },
    async endEpisode(showId) {
      const show = showOf(showId);
      if (!show.currentEpisodeId) return null;
      const ep = { ...must(episodes.get(show.currentEpisodeId), "episode"), endedAt: now() };
      episodes.set(ep.id, ep);
      shows.set(showId, { ...show, currentEpisodeId: null });
      return { ...ep };
    },
  };
  return repo;
}
