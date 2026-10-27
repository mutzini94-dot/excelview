import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { newSecret, secretsEqual } from "@/lib/auth/secrets";
import type { Donation, Episode, Member, MemberTotal, Season, Show } from "@/lib/domain/types";
import type { ShowRepo, ShowSecrets } from "@/lib/repo/types";

type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));

const toShow = (r: Row): Show => ({
  id: r.id as string,
  name: r.name as string,
  mode: r.mode as Show["mode"],
  gridVariant: r.grid_variant as Show["gridVariant"],
  onAirLimit: r.on_air_limit as number,
  excludeHostAudio: r.exclude_host_audio as boolean,
  muteWaiting: r.mute_waiting as boolean,
  spotlightMemberId: (r.spotlight_member_id as string | null) ?? null,
  currentSeasonId: r.current_season_id as string,
  currentEpisodeId: (r.current_episode_id as string | null) ?? null,
});
const toMember = (r: Row): Member => ({
  id: r.id as string,
  showId: r.show_id as string,
  displayName: r.display_name as string,
  role: r.role as Member["role"],
  kicked: r.kicked as boolean,
  onAirMuted: r.on_air_muted as boolean,
  volume: Number(r.volume),
  manualSeat: (r.manual_seat as Member["manualSeat"]) ?? null,
  joinedOrder: r.joined_order as number,
});
const toSeason = (r: Row): Season => ({
  id: r.id as string, showId: r.show_id as string, number: r.number as number, closedAt: isoOrNull(r.closed_at),
});
const toEpisode = (r: Row): Episode => ({
  id: r.id as string, showId: r.show_id as string, seasonId: r.season_id as string, number: r.number as number,
  startedAt: iso(r.started_at), endedAt: isoOrNull(r.ended_at),
});
const toDonation = (r: Row): Donation => ({
  id: r.id as string, showId: r.show_id as string, seasonId: r.season_id as string,
  episodeId: r.episode_id as string, memberId: r.member_id as string, donorName: r.donor_name as string,
  amount: r.amount as number, message: r.message as string, source: r.source as Donation["source"],
  createdAt: iso(r.created_at),
});

const showColumns: Record<string, string> = {
  name: "name", mode: "mode", gridVariant: "grid_variant", onAirLimit: "on_air_limit",
  excludeHostAudio: "exclude_host_audio", muteWaiting: "mute_waiting", spotlightMemberId: "spotlight_member_id",
  currentSeasonId: "current_season_id", currentEpisodeId: "current_episode_id",
};
const memberColumns: Record<string, string> = {
  kicked: "kicked", onAirMuted: "on_air_muted", volume: "volume", manualSeat: "manual_seat", displayName: "display_name",
};
const secretColumns: Record<keyof ShowSecrets, string> = {
  host: "host_secret", operator: "operator_secret", output: "output_secret", invite: "invite_secret",
};

function toColumns(patch: object, map: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) out[map[k]] = v;
  return out;
}

function one(rows: Row[], what: string): Row {
  if (!rows[0]) throw new Error(`NOT_FOUND: ${what}`);
  return rows[0];
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505";

/** Transaction pooler(6543) 접속. 서버리스에서는 함수 인스턴스마다 연결 1~2개만 쓴다 */
export function createSql(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다");
  return postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
}

export function createPostgresRepo(sql: Sql = createSql()): ShowRepo {
  const showRow = async (showId: string) => one(await sql`select * from shows where id = ${showId}`, "show");

  const repo: ShowRepo = {
    async createShow({ name, mode, hostName }) {
      const secrets: ShowSecrets = { host: newSecret(), operator: newSecret(), output: newSecret(), invite: newSecret() };
      const hostMemberSecret = newSecret();
      const showId = randomUUID();
      const seasonId = randomUUID();
      // 쇼·시즌·방장을 한 문장(한 번의 왕복)으로 만든다. id를 미리 정해 서로 참조한다
      const [row] = await sql`
        with s as (
          insert into shows (id, name, mode, current_season_id, host_secret, operator_secret, output_secret, invite_secret)
          values (${showId}, ${name}, ${mode}, ${seasonId}, ${secrets.host}, ${secrets.operator}, ${secrets.output}, ${secrets.invite})
          returning *
        ), season as (
          insert into seasons (id, show_id, number) values (${seasonId}, ${showId}, 1) returning id
        ), host as (
          insert into members (show_id, display_name, role, joined_order, secret)
          values (${showId}, ${hostName}, 'host', 1, ${hostMemberSecret}) returning *
        )
        select row_to_json(s.*) as show, row_to_json(host.*) as host from s, host, season`;
      return { show: toShow(row.show), secrets, hostMember: toMember(row.host), hostMemberSecret };
    },
    async getShow(showId) {
      if (!UUID.test(showId)) return null;
      const [r] = await sql`select * from shows where id = ${showId}`;
      return r ? toShow(r) : null;
    },
    async updateShow(showId, patch) {
      const cols = toColumns(patch, showColumns);
      if (!Object.keys(cols).length) return toShow(await showRow(showId));
      return toShow(one(await sql`update shows set ${sql(cols)} where id = ${showId} returning *`, "show"));
    },
    async getSecrets(showId) {
      const r = await showRow(showId);
      return {
        host: r.host_secret as string, operator: r.operator_secret as string,
        output: r.output_secret as string, invite: r.invite_secret as string,
      };
    },
    async rotateSecret(showId, kind) {
      const fresh = newSecret();
      one(await sql`update shows set ${sql({ [secretColumns[kind]]: fresh })} where id = ${showId} returning id`, "show");
      return fresh;
    },
    async findMemberBySecret(showId, secret) {
      if (!UUID.test(showId)) return null;
      const [r] = await sql`select * from members where show_id = ${showId} and secret = ${secret}`;
      return r && secretsEqual(secret, r.secret as string) ? toMember(r) : null;
    },
    async getMemberSecret(memberId) {
      return one(await sql`select secret from members where id = ${memberId}`, "member").secret as string;
    },
    async createMember(showId, displayName) {
      const secret = newSecret();
      // 동시 등록으로 joined_order가 겹치면 다시 시도한다
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const [r] = await sql`
            insert into members (show_id, display_name, joined_order, secret)
            select ${showId}, ${displayName}, coalesce(max(joined_order), 0) + 1, ${secret}
            from members where show_id = ${showId}
            returning *`;
          return { member: toMember(r), secret };
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      throw new Error("DB_ERROR: create member: joined_order 충돌");
    },
    async listMembers(showId) {
      return (await sql`select * from members where show_id = ${showId} order by joined_order`).map(toMember);
    },
    async updateMember(memberId, patch) {
      const cols = toColumns(patch, memberColumns);
      if (!Object.keys(cols).length) return toMember(one(await sql`select * from members where id = ${memberId}`, "member"));
      return toMember(one(await sql`update members set ${sql(cols)} where id = ${memberId} returning *`, "member"));
    },
    async addDonation(d) {
      const [r] = await sql`
        insert into donations (show_id, season_id, episode_id, member_id, donor_name, amount, message, source)
        values (${d.showId}, ${d.seasonId}, ${d.episodeId}, ${d.memberId}, ${d.donorName}, ${d.amount}, ${d.message}, ${d.source})
        returning *`;
      return toDonation(r);
    },
    async listDonations(showId, { seasonId, episodeId }) {
      const rows = await sql`
        select * from donations
        where show_id = ${showId}
          ${seasonId ? sql`and season_id = ${seasonId}` : sql``}
          ${episodeId ? sql`and episode_id = ${episodeId}` : sql``}
        order by created_at`;
      return rows.map(toDonation);
    },
    async deleteDonations(showId, source) {
      const rows = await sql`delete from donations where show_id = ${showId} and source = ${source} returning id`;
      return rows.length;
    },
    async getTotals(showId, seasonId, episodeId) {
      const rows = await sql`
        select m.id as member_id,
               coalesce(sum(d.amount), 0)::int as season,
               coalesce(sum(d.amount) filter (where d.episode_id = ${episodeId}), 0)::int as episode,
               max(d.created_at) as last_at
        from members m
        left join donations d on d.member_id = m.id and d.season_id = ${seasonId}
        where m.show_id = ${showId}
        group by m.id, m.joined_order
        order by m.joined_order`;
      return rows.map((r): MemberTotal => ({
        memberId: r.member_id as string, season: r.season as number, episode: r.episode as number,
        lastDonationAt: isoOrNull(r.last_at),
      }));
    },
    async getSeason(seasonId) {
      return toSeason(one(await sql`select * from seasons where id = ${seasonId}`, "season"));
    },
    async listSeasons(showId) {
      return (await sql`select * from seasons where show_id = ${showId} order by number`).map(toSeason);
    },
    async startSeason(showId) {
      const [r] = await sql`
        with cur as (
          update seasons set closed_at = now()
          where id = (select current_season_id from shows where id = ${showId})
          returning show_id, number
        ), next as (
          insert into seasons (show_id, number) select show_id, number + 1 from cur returning *
        ), upd as (
          update shows set current_season_id = next.id from next where shows.id = next.show_id returning shows.id
        )
        select next.* from next, upd`;
      return toSeason(one(r ? [r] : [], "show"));
    },
    async getEpisode(episodeId) {
      return toEpisode(one(await sql`select * from episodes where id = ${episodeId}`, "episode"));
    },
    async listEpisodes(showId, seasonId) {
      return (await sql`select * from episodes where show_id = ${showId} and season_id = ${seasonId} order by number`).map(toEpisode);
    },
    async startEpisode(showId) {
      const [r] = await sql`
        with s as (select id, current_season_id from shows where id = ${showId}),
        ep as (
          insert into episodes (show_id, season_id, number)
          select s.id, s.current_season_id,
                 coalesce((select max(number) from episodes e where e.season_id = s.current_season_id), 0) + 1
          from s returning *
        ), upd as (
          update shows set current_episode_id = ep.id from ep where shows.id = ep.show_id returning shows.id
        )
        select ep.* from ep, upd`;
      return toEpisode(one(r ? [r] : [], "show"));
    },
    async endEpisode(showId) {
      const [r] = await sql`
        with ep as (
          update episodes set ended_at = now()
          where id = (select current_episode_id from shows where id = ${showId})
          returning *
        ), upd as (
          update shows set current_episode_id = null where id = ${showId} and current_episode_id is not null returning id
        )
        select ep.* from ep, upd`;
      return r ? toEpisode(r) : null;
    },
  };
  return repo;
}
