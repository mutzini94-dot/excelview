export type ShowMode = "excel" | "grid";
export type GridVariant = "grid" | "spotlight";
export type DonationSource = "test" | "adjustment" | "toonation";
export type Seat = "on_air" | "waiting";

export interface Show {
  id: string;
  name: string;
  mode: ShowMode;
  gridVariant: GridVariant;
  onAirLimit: number;
  excludeHostAudio: boolean;
  muteWaiting: boolean;
  spotlightMemberId: string | null;
  currentSeasonId: string;
  currentEpisodeId: string | null;
}

export interface Member {
  id: string;
  showId: string;
  displayName: string;
  role: "host" | "member";
  kicked: boolean;
  /** 방장이 켜고 끄는 방송 음소거 */
  onAirMuted: boolean;
  /** 방송 화면 믹스 볼륨 0~2 */
  volume: number;
  /** 방장 수동 지정. null이면 모드가 결정 */
  manualSeat: Seat | null;
  /** 등록 순서(1부터) */
  joinedOrder: number;
}

export interface Season {
  id: string;
  showId: string;
  number: number;
  closedAt: string | null;
}

export interface Episode {
  id: string;
  showId: string;
  seasonId: string;
  number: number;
  startedAt: string;
  endedAt: string | null;
}

export interface Donation {
  id: string;
  showId: string;
  seasonId: string;
  episodeId: string;
  memberId: string;
  donorName: string;
  amount: number;
  message: string;
  source: DonationSource;
  createdAt: string;
}

export interface MemberTotal {
  memberId: string;
  season: number;
  episode: number;
  /** 시즌 기준 마지막 후원 시각 */
  lastDonationAt: string | null;
}

export interface ShowSnapshot {
  show: Show;
  members: Member[];
  totals: MemberTotal[];
  season: Season;
  episode: Episode | null;
  version: number;
}
