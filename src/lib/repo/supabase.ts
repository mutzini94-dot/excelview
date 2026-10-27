import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newSecret, secretsEqual } from "@/lib/auth/secrets";
import type { Donation, Episode, Member, Season, Show } from "@/lib/domain/types";
import { sumTotals, type ShowRepo, type ShowSecrets } from "@/lib/repo/types";

type Row = Record<string, unknown>;

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
  id: r.id as string, showId: r.show_id as string, number: r.number as number,
  closedAt: (r.closed_at as string | null) ?? null,
});
const toEpisode = (r: Row): Episode => ({
  id: r.id as string, showId: r.show_id as string, seasonId: r.season_id as string, number: r.number as number,
  startedAt: r.started_at as string, endedAt: (r.ended_at as string | null) ?? null,
});
const toDonation = (r: Row): Donation => ({
  id: r.id as string, showId: r.show_id as string, seasonId: r.season_id as string,
  episodeId: r.episode_id as string, memberId: r.member_id as string, donorName: r.donor_name as string,
  amount: r.amount as number, message: r.message as string, source: r.source as Donation["source"],
  createdAt: r.created_at as string,
});

const showPatchColumns: Record<string, string> = {
  name: "name", mode: "mode", gridVariant: "grid_variant", onAirLimit: "on_air_limit",
  excludeHostAudio: "exclude_host_audio", muteWaiting: "mute_waiting", spotlightMemberId: "spotlight_member_id",
  currentSeasonId: "current_season_id", currentEpisodeId: "current_episode_id",
};
const memberPatchColumns: Record<string, string> = {
  kicked: "kicked", onAirMuted: "on_air_muted", volume: "volume", manualSeat: "manual_seat",
  displayName: "display_name",
};
const secretColumns: Record<keyof ShowSecrets, string> = {
  host: "host_secret", operator: "operator_secret", output: "output_secret", invite: "invite_secret",
};

function toColumns(patch: object, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) out[map[k]] = v;
  return out;
}

function check(res: { data: unknown; error: { message: string } | null }, what: string): unknown {
  if (res.error) throw new Error(`DB_ERROR: ${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`NOT_FOUND: ${what}`);
  return res.data;
}

export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createSupabaseRepo(db: SupabaseClient = createSupabaseClient()): ShowRepo {
  const getShowRow = async (showId: string) =>
    check(await db.from("shows").select("*").eq("id", showId).maybeSingle(), "show") as Row;

  const repo: ShowRepo = {
    async createShow({ name, mode, hostName }) {
      const secrets: ShowSecrets = { host: newSecret(), operator: newSecret(), output: newSecret(), invite: newSecret() };
      const showRow = check(await db.from("shows").insert({
        name, mode,
        host_secret: secrets.host, operator_secret: secrets.operator,
        output_secret: secrets.output, invite_secret: secrets.invite,
      }).select().single(), "create show") as Row;
      const season = check(await db.from("seasons").insert({ show_id: showRow.id, number: 1 }).select().single(), "season") as Row;
      await repo.updateShow(showRow.id as string, { currentSeasonId: season.id as string });
      const { member, secret } = await repo.createMember(showRow.id as string, hostName);
      const hostRow = check(await db.from("members").update({ role: "host" }).eq("id", member.id).select().single(), "host") as Row;
      const show = (await repo.getShow(showRow.id as string))!;
      return { show, secrets, hostMember: toMember(hostRow), hostMemberSecret: secret };
    },
    async getShow(showId) {
      const res = await db.from("shows").select("*").eq("id", showId).maybeSingle();
      // uuid 형식이 아닌 id는 DB가 오류로 돌려준다 → 없는 쇼로 취급
      if (res.error || !res.data) return null;
      return toShow(res.data as Row);
    },
    async updateShow(showId, patch) {
      const row = check(await db.from("shows").update(toColumns(patch, showPatchColumns)).eq("id", showId).select().single(), "update show");
      return toShow(row as Row);
    },
    async getSecrets(showId) {
      const r = await getShowRow(showId);
      return {
        host: r.host_secret as string, operator: r.operator_secret as string,
        output: r.output_secret as string, invite: r.invite_secret as string,
      };
    },
    async rotateSecret(showId, kind) {
      const fresh = newSecret();
      check(await db.from("shows").update({ [secretColumns[kind]]: fresh }).eq("id", showId).select("id").single(), "rotate");
      return fresh;
    },
    async findMemberBySecret(showId, secret) {
      const res = await db.from("members").select("*").eq("show_id", showId).eq("secret", secret).maybeSingle();
      if (res.error || !res.data) return null;
      const row = res.data as Row;
      return secretsEqual(secret, row.secret as string) ? toMember(row) : null;
    },
    async createMember(showId, displayName) {
      const secret = newSecret();
      // joined_order 충돌(동시 등록) 시 몇 번 다시 시도한다
      for (let attempt = 0; attempt < 5; attempt++) {
        const { count } = await db.from("members").select("id", { count: "exact", head: true }).eq("show_id", showId);
        const res = await db.from("members").insert({
          show_id: showId, display_name: displayName, joined_order: (count ?? 0) + 1, secret,
        }).select().single();
        if (!res.error) return { member: toMember(res.data as Row), secret };
        if (!res.error.message.includes("joined_order")) throw new Error(`DB_ERROR: create member: ${res.error.message}`);
      }
      throw new Error("DB_ERROR: create member: joined_order 충돌");
    },
    async listMembers(showId) {
      const rows = check(await db.from("members").select("*").eq("show_id", showId).order("joined_order"), "members");
      return (rows as Row[]).map(toMember);
    },
    async updateMember(memberId, patch) {
      const row = check(await db.from("members").update(toColumns(patch, memberPatchColumns)).eq("id", memberId).select().single(), "update member");
      return toMember(row as Row);
    },
    async addDonation(d) {
      const row = check(await db.from("donations").insert({
        show_id: d.showId, season_id: d.seasonId, episode_id: d.episodeId, member_id: d.memberId,
        donor_name: d.donorName, amount: d.amount, message: d.message, source: d.source,
      }).select().single(), "donation");
      return toDonation(row as Row);
    },
    async listDonations(showId, { seasonId, episodeId }) {
      let q = db.from("donations").select("*").eq("show_id", showId);
      if (seasonId) q = q.eq("season_id", seasonId);
      if (episodeId) q = q.eq("episode_id", episodeId);
      const rows = check(await q.order("created_at"), "donations");
      return (rows as Row[]).map(toDonation);
    },
    async deleteDonations(showId, source) {
      const rows = check(await db.from("donations").delete().eq("show_id", showId).eq("source", source).select("id"), "delete");
      return (rows as Row[]).length;
    },
    async getTotals(showId, seasonId, episodeId) {
      return sumTotals(await repo.listMembers(showId), await repo.listDonations(showId, { seasonId }), episodeId);
    },
    async getSeason(seasonId) {
      return toSeason(check(await db.from("seasons").select("*").eq("id", seasonId).single(), "season") as Row);
    },
    async listSeasons(showId) {
      const rows = check(await db.from("seasons").select("*").eq("show_id", showId).order("number"), "seasons");
      return (rows as Row[]).map(toSeason);
    },
    async startSeason(showId) {
      const show = toShow(await getShowRow(showId));
      const prev = await repo.getSeason(show.currentSeasonId);
      check(await db.from("seasons").update({ closed_at: new Date().toISOString() }).eq("id", prev.id).select("id").single(), "close season");
      const next = toSeason(check(await db.from("seasons").insert({ show_id: showId, number: prev.number + 1 }).select().single(), "season") as Row);
      await repo.updateShow(showId, { currentSeasonId: next.id });
      return next;
    },
    async getEpisode(episodeId) {
      return toEpisode(check(await db.from("episodes").select("*").eq("id", episodeId).single(), "episode") as Row);
    },
    async listEpisodes(showId, seasonId) {
      const rows = check(await db.from("episodes").select("*").eq("show_id", showId).eq("season_id", seasonId).order("number"), "episodes");
      return (rows as Row[]).map(toEpisode);
    },
    async startEpisode(showId) {
      const show = toShow(await getShowRow(showId));
      const count = (await repo.listEpisodes(showId, show.currentSeasonId)).length;
      const ep = toEpisode(check(await db.from("episodes").insert({
        show_id: showId, season_id: show.currentSeasonId, number: count + 1,
      }).select().single(), "episode") as Row);
      await repo.updateShow(showId, { currentEpisodeId: ep.id });
      return ep;
    },
    async endEpisode(showId) {
      const show = toShow(await getShowRow(showId));
      if (!show.currentEpisodeId) return null;
      const ep = toEpisode(check(await db.from("episodes").update({ ended_at: new Date().toISOString() })
        .eq("id", show.currentEpisodeId).select().single(), "end episode") as Row);
      await repo.updateShow(showId, { currentEpisodeId: null });
      return ep;
    },
  };
  return repo;
}
