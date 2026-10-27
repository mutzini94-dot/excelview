import type {
  Donation, DonationSource, Episode, Member, MemberTotal, Season, Show, ShowMode,
} from "@/lib/domain/types";

export interface ShowSecrets {
  host: string;
  operator: string;
  output: string;
  invite: string;
}

export type MemberPatch = Partial<Pick<Member, "kicked" | "onAirMuted" | "volume" | "manualSeat" | "displayName">>;

export interface ShowRepo {
  createShow(input: { name: string; mode: ShowMode; hostName: string }): Promise<{
    show: Show; secrets: ShowSecrets; hostMember: Member; hostMemberSecret: string;
  }>;
  getShow(showId: string): Promise<Show | null>;
  updateShow(showId: string, patch: Partial<Omit<Show, "id">>): Promise<Show>;
  getSecrets(showId: string): Promise<ShowSecrets>;
  rotateSecret(showId: string, kind: keyof ShowSecrets): Promise<string>;
  findMemberBySecret(showId: string, secret: string): Promise<Member | null>;
  getMemberSecret(memberId: string): Promise<string>;
  createMember(showId: string, displayName: string): Promise<{ member: Member; secret: string }>;
  listMembers(showId: string): Promise<Member[]>;
  updateMember(memberId: string, patch: MemberPatch): Promise<Member>;
  addDonation(d: Omit<Donation, "id" | "createdAt">): Promise<Donation>;
  listDonations(showId: string, filter: { seasonId?: string; episodeId?: string }): Promise<Donation[]>;
  deleteDonations(showId: string, source: DonationSource): Promise<number>;
  getTotals(showId: string, seasonId: string, episodeId: string | null): Promise<MemberTotal[]>;
  getSeason(seasonId: string): Promise<Season>;
  listSeasons(showId: string): Promise<Season[]>;
  /** 이전 시즌 closedAt 기록, 번호 +1 */
  startSeason(showId: string): Promise<Season>;
  getEpisode(episodeId: string): Promise<Episode>;
  listEpisodes(showId: string, seasonId: string): Promise<Episode[]>;
  /** 현재 시즌 안에서 번호 +1 */
  startEpisode(showId: string): Promise<Episode>;
  endEpisode(showId: string): Promise<Episode | null>;
}

/** 회원 목록과 시즌 후원으로 합계를 낸다(저장소 구현 공용) */
export function sumTotals(members: Member[], seasonDonations: Donation[], episodeId: string | null): MemberTotal[] {
  return members.map((m) => {
    const mine = seasonDonations.filter((d) => d.memberId === m.id);
    const last = mine.reduce<string | null>((acc, d) => (acc === null || d.createdAt > acc ? d.createdAt : acc), null);
    return {
      memberId: m.id,
      season: mine.reduce((s, d) => s + d.amount, 0),
      episode: mine.filter((d) => d.episodeId === episodeId).reduce((s, d) => s + d.amount, 0),
      lastDonationAt: last,
    };
  });
}
