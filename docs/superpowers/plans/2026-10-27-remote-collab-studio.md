# 원격 합방 스튜디오 v1 실행계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버들이 각자 브라우저로 접속해 한 화면에 모이고, 방장이 콘솔로 진행하며, 합쳐진 화면을 OBS 브라우저 소스로 송출하는 원격 합방 스튜디오 v1(리허설용)을 만든다.

**Architecture:** Next.js 웹앱 하나에 페이지 4종(방 만들기, 멤버 입장, 방장 콘솔, 방송 화면)을 둔다. 영상·음성은 LiveKit Cloud가 맡고, 쇼·멤버·시즌·회차·후원의 기준 데이터는 Supabase에 둔다. 서버 API가 DB에 쓴 뒤, 바뀐 상태 전체(스냅샷)를 LiveKit 데이터 채널로 방 안의 모든 화면에 뿌린다. 클라이언트는 DB에 직접 접근하지 않는다. 레이아웃은 모드 플러그인(`grid`, `excel`)의 순수 함수가 계산하고, 화면은 그 결과를 그대로 그린다.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Tailwind CSS, `livekit-client` 2.x, `@livekit/components-react` 2.x, `livekit-server-sdk` 2.x, `@supabase/supabase-js` 2.x, Vitest(단위 테스트), Vercel(배포).

**Spec:** `docs/specs/2026-10-27-remote-collab-studio-design.md`

---

## 이 계획을 읽는 사람에게 (사용자용 안내)

- 코드는 Claude Code가 작성합니다. 각 Task 끝의 **"👤 사용자 확인"** 단계만 직접 해 주시면 됩니다. 브라우저에서 무엇을 눌러 보고, 무엇이 보이면 통과인지 적어 두었습니다.
- **🔑 표시가 있는 단계**(계정 가입, 비밀 키 복사·붙여넣기)는 보안상 Claude가 대신할 수 없어서 직접 하셔야 합니다.
- Task는 순서대로 진행합니다. 한 Task의 사용자 확인이 통과하면 다음 Task로 넘어갑니다.

## Global Constraints

- 앱 폴더: 저장소 루트의 `remote-studio/`. 모든 명령은 이 폴더에서 실행한다.
- Node.js 20 이상.
- 로그인 없음. 접근은 비밀 링크로만 하고, 링크 종류는 **방장 / 운영자 / 방송 화면 / 초대 / 멤버 개인** 5종을 각각 다른 비밀값으로 분리한다.
- 비밀값: 32바이트 난수의 base64url 문자열. URL 경로에 넣고, 쿼리스트링에는 넣지 않는다.
- 클라이언트(브라우저)는 Supabase에 직접 접근하지 않는다. DB 접근은 서버 API에서 service role 키로만 한다.
- 출연석 기본 인원 `onAirLimit = 12`.
- 멤버 카메라 송출 상한 720p(`VideoPresets.h720`), simulcast 켬, `adaptiveStream`·`dynacast` 켬.
- 방송 화면 캔버스는 1920×1080 고정. 조작 UI 없음. 배경 투명이 아닌 단색(`#0b0b10`).
- 마이크 기본 옵션: `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`.
- 후원 금액 단위는 원(KRW, 정수). 후원 출처 `source`는 `'test' | 'adjustment' | 'toonation'` 중 하나이며, v1에서는 `'test'`와 `'adjustment'`만 생성한다.
- 순위는 시즌 단위로 누적한다. 순위표에는 "시즌 누적"과 "이번 회차"를 함께 표시한다.
- 화면에 보이는 문구는 한국어로 쓴다.
- 비밀 키(.env.local)는 git에 올리지 않는다.

## Review Focus

1. **방송 중 멤버가 새로고침하거나 회선이 끊겼다가 다시 들어올 때**: 같은 멤버로 인식되어 타일이 두 개 생기지 않고, 순위와 누적액이 그대로여야 한다. → Task 4 테스트 `같은 멤버 비밀값으로 토큰을 다시 받으면 identity가 같다`, Task 9 테스트 `멤버 목록에 같은 id가 두 번 있어도 타일은 하나`.
2. **테스트 후원 버튼을 빠르게 연타할 때**: 모든 후원이 합산되고, 알림은 사라지지 않고 차례대로 나와야 한다. → Task 8 테스트 `알림 큐는 연속 입력을 모두 순서대로 보관한다`, `후원 두 건을 동시에 넣으면 합계가 두 건 모두 반영된다`.
3. **후원액이 같은 동점자**: 순위가 새로고침할 때마다 바뀌면 안 된다. 금액이 같으면 그 금액에 먼저 도달한 사람이 위, 그다음은 먼저 입장한 사람이 위다. → Task 9 테스트 `동점이면 마지막 후원 시각이 이른 멤버가 위`.
4. **내보낸 멤버가 예전 개인 링크로 다시 들어오려 할 때**: 입장 토큰 발급이 거절되어야 한다. → Task 4 테스트 `내보낸 멤버는 토큰을 받을 수 없다`.
5. **카메라를 끄거나 권한을 거부한 멤버**: 레이아웃이 깨지지 않고, 그 자리에 닉네임이 적힌 빈 타일이 보여야 한다. → Task 7 테스트 `카메라 트랙이 없는 멤버도 타일을 받는다`.

---

## 파일 구조

```
remote-studio/
  .env.example                      # 필요한 환경변수 이름 목록(값 없음)
  supabase/migrations/0001_init.sql # DB 테이블 정의
  src/
    lib/
      domain/types.ts               # Show, Member, Donation, Snapshot 등 공용 타입
      auth/secrets.ts               # 비밀값 생성
      auth/access.ts                # 비밀값 → 역할(host/operator/output/member) 판별
      repo/types.ts                 # ShowRepo 인터페이스
      repo/memory.ts                # 테스트용 메모리 저장소
      repo/supabase.ts              # 실제 Supabase 저장소
      livekit/gateway.ts            # LiveKitGateway 인터페이스 + 실제 구현
      livekit/fake.ts               # 테스트용 가짜 게이트웨이
      realtime/messages.ts          # 데이터 채널 메시지 타입과 인코딩
      realtime/publish.ts           # 스냅샷/후원 알림 방송
      ranking/rank.ts               # 순위 계산(시즌/회차)
      seats/assign.ts               # 출연석/대기석 배정
      modes/types.ts                # ModeDefinition, Layout, Tile
      modes/grid.ts                 # 일반 합방 모드(그리드/스포트라이트)
      modes/excel.ts                # 엑셀 모드
      modes/index.ts                # 모드 등록부
      alerts/queue.ts               # 후원 알림 큐
      alerts/chime.ts               # 알림음(WebAudio로 생성, 음원 파일 없음)
      export/csv.ts                 # CSV 생성
      audio/headset.ts              # 헤드셋 추정
      services/                     # API 로직(라우트와 분리해서 테스트 가능)
        shows.ts  members.ts  donations.ts  episodes.ts  snapshot.ts  tokens.ts
    app/
      page.tsx                                  # 방 만들기
      s/[showId]/created/[hostSecret]/page.tsx  # 만들어진 링크 모음
      s/[showId]/join/[inviteSecret]/page.tsx   # 초대 링크 → 닉네임 등록
      s/[showId]/m/[memberSecret]/page.tsx      # 멤버(방장 포함) 출연 화면
      s/[showId]/host/[secret]/page.tsx         # 방장/운영자 콘솔(운영자 비밀값도 이 경로)
      s/[showId]/out/[secret]/page.tsx          # 방송 화면(OBS용)
      api/shows/route.ts                        # POST 쇼 만들기
      api/shows/[showId]/[...action]/route.ts   # 나머지 API(얇은 라우터)
    components/
      StageRenderer.tsx   # Layout을 받아 타일을 그림(방송 화면·멤버 화면 공용)
      Leaderboard.tsx     # 순위표
      AlertBanner.tsx     # 후원 알림 표시
      PreJoin.tsx         # 입장 전 장비 점검
      console/*.tsx       # 콘솔 구성 요소
    hooks/useShowState.ts # 초기 스냅샷 + 데이터 채널 갱신 구독
  tests/                  # Vitest, src와 같은 구조
```

설계 문서는 방송 화면 주소를 `/room/{id}/output`로 예시했지만, 비밀 링크 구조에 맞춰 `/s/{showId}/out/{secret}`로 정한다.

---

### Task 1: 계정 준비, 프로젝트 뼈대, 첫 배포

**Files:**
- Create: `remote-studio/` (Next.js 프로젝트), `remote-studio/.env.example`, `remote-studio/vitest.config.ts`, `remote-studio/tests/smoke.test.ts`, 저장소 루트 `.gitignore`

**Interfaces:**
- Produces: `npm run dev`, `npm test`, `npm run build` 명령. 환경변수 이름 `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_LIVEKIT_URL`.

- [ ] **Step 1: 🔑 사용자 계정 가입** — LiveKit Cloud(cloud.livekit.io), Supabase(supabase.com), Vercel(vercel.com), GitHub에 가입한다. LiveKit에서 프로젝트를 만들고, Supabase에서 프로젝트(지역: Seoul)를 만든다.
- [ ] **Step 2: 프로젝트 생성** — `npx create-next-app@latest remote-studio --ts --tailwind --app --src-dir --eslint --no-turbopack --import-alias "@/*"`. 이어서 `npm i livekit-client @livekit/components-react @livekit/components-styles livekit-server-sdk @supabase/supabase-js`와 `npm i -D vitest @vitejs/plugin-react jsdom`을 실행한다.
- [ ] **Step 3: 테스트 실행 환경** — `vitest.config.ts`(environment `node`, alias `@` → `src`)와 `package.json`의 `"test": "vitest run"`을 추가한다. `tests/smoke.test.ts`에는 `expect(1 + 1).toBe(2)`를 둔다.
- [ ] **Step 4: 확인** — `npm test` 실행. 기대 결과: 1 passed.
- [ ] **Step 5: 첫 화면** — `src/app/page.tsx`에 "원격 합방 스튜디오" 제목만 표시한다. `.env.example`에 위 환경변수 이름 6개를 값 없이 적는다.
- [ ] **Step 6: 🔑 비밀 키 입력** — 사용자가 `.env.example`을 복사해 `.env.local`을 만들고, LiveKit 프로젝트 설정의 URL·API Key·Secret과 Supabase의 Project URL·service_role 키를 붙여넣는다.
- [ ] **Step 7: git과 배포** — 저장소 루트에서 `git init`, `.gitignore`에 `node_modules`, `.next`, `.env*.local`을 넣고 커밋한다. 🔑 사용자가 GitHub에 빈 저장소를 만들면 Claude가 `git remote add origin <주소>`와 `git push -u origin main`을 실행한다. 🔑 사용자가 Vercel에서 이 저장소를 Import하고(Root Directory: `remote-studio`), Environment Variables에 `.env.local`의 값을 입력한다.
- [ ] **Step 8: 👤 사용자 확인** — Vercel이 알려준 주소(…vercel.app)를 열었을 때 "원격 합방 스튜디오" 제목이 보이면 통과.
- [ ] **Step 9: Commit** — `git commit -m "chore: scaffold remote-studio"`

---

### Task 2: 공용 타입, 비밀 링크, 저장소, DB 테이블

**Files:**
- Create: `src/lib/domain/types.ts`, `src/lib/auth/secrets.ts`, `src/lib/auth/access.ts`, `src/lib/repo/types.ts`, `src/lib/repo/memory.ts`, `src/lib/repo/supabase.ts`, `supabase/migrations/0001_init.sql`
- Test: `tests/lib/auth/access.test.ts`, `tests/lib/repo/memory.test.ts`

**Interfaces:**
- Produces:

```ts
// domain/types.ts
export type ShowMode = 'excel' | 'grid';
export type GridVariant = 'grid' | 'spotlight';
export type DonationSource = 'test' | 'adjustment' | 'toonation';
export type Seat = 'on_air' | 'waiting';

export interface Show {
  id: string; name: string; mode: ShowMode; gridVariant: GridVariant;
  onAirLimit: number;            // 기본 12
  excludeHostAudio: boolean;     // 기본 false
  muteWaiting: boolean;          // 대기석 전체 음소거, 기본 false
  spotlightMemberId: string | null;
  currentSeasonId: string; currentEpisodeId: string | null;
}
export interface Member {
  id: string; showId: string; displayName: string;
  role: 'host' | 'member';
  kicked: boolean;
  onAirMuted: boolean;           // 방송 음소거(방장이 켜고 끔)
  volume: number;                // 방송 화면 믹스 볼륨 0~2, 기본 1
  manualSeat: Seat | null;       // 방장 수동 지정, null이면 모드가 결정
  joinedOrder: number;           // 등록 순서(1부터)
}
export interface Season { id: string; showId: string; number: number; closedAt: string | null }
export interface Episode { id: string; showId: string; seasonId: string; number: number; startedAt: string; endedAt: string | null }
export interface Donation {
  id: string; showId: string; seasonId: string; episodeId: string;
  memberId: string; donorName: string; amount: number; message: string;
  source: DonationSource; createdAt: string;
}
export interface MemberTotal {
  memberId: string; season: number; episode: number;
  lastDonationAt: string | null; // 시즌 기준 마지막 후원 시각
}
export interface ShowSnapshot {
  show: Show; members: Member[]; totals: MemberTotal[];
  season: Season; episode: Episode | null; version: number;
}

// auth/secrets.ts
export function newSecret(): string; // 32바이트 base64url

// auth/access.ts
export type Access =
  | { role: 'host' } | { role: 'operator' } | { role: 'output' }
  | { role: 'invite' } | { role: 'member'; memberId: string };
export function resolveAccess(repo: ShowRepo, showId: string, secret: string): Promise<Access | null>;
export function canControl(a: Access | null): boolean; // host 또는 operator

// repo/types.ts — 모든 메서드는 Promise를 반환
export interface ShowRepo {
  createShow(input: { name: string; mode: ShowMode; hostName: string }): Promise<{ show: Show; secrets: ShowSecrets; hostMember: Member; hostMemberSecret: string }>;
  getShow(showId: string): Promise<Show | null>;
  updateShow(showId: string, patch: Partial<Omit<Show, 'id'>>): Promise<Show>;
  getSecrets(showId: string): Promise<ShowSecrets>;
  rotateSecret(showId: string, kind: keyof ShowSecrets): Promise<string>;
  findMemberBySecret(showId: string, secret: string): Promise<Member | null>;
  createMember(showId: string, displayName: string): Promise<{ member: Member; secret: string }>;
  listMembers(showId: string): Promise<Member[]>;
  updateMember(memberId: string, patch: Partial<Pick<Member, 'kicked' | 'onAirMuted' | 'volume' | 'manualSeat' | 'displayName'>>): Promise<Member>;
  addDonation(d: Omit<Donation, 'id' | 'createdAt'>): Promise<Donation>;
  listDonations(showId: string, filter: { seasonId?: string; episodeId?: string }): Promise<Donation[]>;
  deleteDonations(showId: string, source: DonationSource): Promise<number>;
  getTotals(showId: string, seasonId: string, episodeId: string | null): Promise<MemberTotal[]>;
  getSeason(seasonId: string): Promise<Season>;
  listSeasons(showId: string): Promise<Season[]>;
  startSeason(showId: string): Promise<Season>;      // 이전 시즌 closedAt 기록, 번호 +1
  getEpisode(episodeId: string): Promise<Episode>;
  listEpisodes(showId: string, seasonId: string): Promise<Episode[]>;
  startEpisode(showId: string): Promise<Episode>;    // 현재 시즌 안에서 번호 +1
  endEpisode(showId: string): Promise<Episode | null>;
}
export interface ShowSecrets { host: string; operator: string; output: string; invite: string }
```

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/lib/auth/access.test.ts`

```ts
test('비밀값마다 역할이 구분된다', async () => {
  const repo = createMemoryRepo();
  const { show, secrets, hostMemberSecret } = await repo.createShow({ name: '테스트쇼', mode: 'excel', hostName: '방장' });
  expect(await resolveAccess(repo, show.id, secrets.host)).toEqual({ role: 'host' });
  expect(await resolveAccess(repo, show.id, secrets.operator)).toEqual({ role: 'operator' });
  expect(await resolveAccess(repo, show.id, secrets.output)).toEqual({ role: 'output' });
  expect(await resolveAccess(repo, show.id, secrets.invite)).toEqual({ role: 'invite' });
  expect((await resolveAccess(repo, show.id, hostMemberSecret))?.role).toBe('member');
  expect(await resolveAccess(repo, show.id, 'wrong')).toBeNull();
});
test('재발급한 방장 비밀값만 통한다', async () => { /* rotateSecret('host') 후 옛 값은 null, 새 값은 host */ });
test('canControl은 host와 operator만 true', () => { /* output, member, invite, null → false */ });
```

`tests/lib/repo/memory.test.ts`:

```ts
test('쇼를 만들면 시즌 1이 생기고 방장이 1번 멤버다', async () => {
  const { show, hostMember } = await repo.createShow({ name: '쇼', mode: 'grid', hostName: '방장' });
  expect((await repo.getSeason(show.currentSeasonId)).number).toBe(1);
  expect(hostMember).toMatchObject({ role: 'host', joinedOrder: 1, volume: 1, onAirMuted: false, manualSeat: null });
  expect(show).toMatchObject({ onAirLimit: 12, currentEpisodeId: null, excludeHostAudio: false });
});
test('getTotals는 시즌 합계와 회차 합계를 따로 낸다', async () => { /* 회차1에 1만, 회차2에 2만 → season 30000, episode(회차2) 20000 */ });
test('deleteDonations("test")는 test 출처만 지운다', async () => { /* test 2건 + adjustment 1건 → 2 반환, 1건 남음 */ });
```

- [ ] **Step 2: 실패 확인** — `npm test` → 모듈 없음으로 FAIL.
- [ ] **Step 3: 구현** — 위 타입, `newSecret`(`crypto.randomBytes(32).toString('base64url')`), `resolveAccess`, `createMemoryRepo(): ShowRepo`를 만든다. 비밀값 비교는 `crypto.timingSafeEqual`을 쓴다.
- [ ] **Step 4: 통과 확인** — `npm test` → 모두 PASS.
- [ ] **Step 5: DB 테이블** — `0001_init.sql`에 `shows`(위 Show 필드 + `host_secret`, `operator_secret`, `output_secret`, `invite_secret`), `members`(+ `secret` unique), `seasons`, `episodes`, `donations`(`source` check 제약, `amount integer check (amount <> 0)`) 테이블과 `donations(show_id, season_id)` 인덱스를 만든다. 모든 테이블에 RLS를 켜고 정책은 두지 않는다(서버 service role만 접근).
- [ ] **Step 6: Supabase 구현** — `createSupabaseRepo(): ShowRepo`를 `repo/supabase.ts`에 만든다. `getTotals`는 `donations`를 시즌으로 걸러 가져와 JS로 합산한다(v1 데이터 규모에서 충분). 방장 멤버 생성과 시즌 1 생성은 쇼 생성과 함께 처리한다.
- [ ] **Step 7: 🔑 테이블 만들기** — 사용자가 Supabase 대시보드 → SQL Editor에 `0001_init.sql` 내용을 붙여넣고 Run을 누른다. 👤 확인: Table Editor에 테이블 5개가 보이면 통과.
- [ ] **Step 8: Commit** — `git commit -m "feat: domain types, secret links, repositories, schema"`

---

### Task 3: 방 만들기와 링크 모음 화면

**Files:**
- Create: `src/lib/services/shows.ts`, `src/app/api/shows/route.ts`, `src/app/page.tsx`(수정), `src/app/s/[showId]/created/[hostSecret]/page.tsx`
- Test: `tests/lib/services/shows.test.ts`

**Interfaces:**
- Consumes: `ShowRepo.createShow`, `getSecrets`, `resolveAccess`
- Produces:

```ts
export function createShow(deps: { repo: ShowRepo }, input: { name: string; mode: ShowMode; hostName: string }):
  Promise<{ showId: string; links: ShowLinks }>;
export function getLinks(deps: { repo: ShowRepo }, showId: string, hostSecret: string): Promise<ShowLinks | null>;
export interface ShowLinks { host: string; operator: string; output: string; invite: string; hostStage: string } // 경로만(도메인 제외)
```

- [ ] **Step 1: 실패하는 테스트** — `createShow`가 이름이 비었거나 40자를 넘으면 `Error('INVALID_NAME')`; 정상 입력이면 `links.host === '/s/{id}/host/{hostSecret}'`, `links.hostStage === '/s/{id}/m/{hostMemberSecret}'` 형식; `getLinks`에 방장 비밀값이 아닌 값을 넣으면 `null`.
- [ ] **Step 2: 실패 확인** — `npm test tests/lib/services/shows.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 서비스 함수, `POST /api/shows`(본문 `{name, mode, hostName}` → `{showId, createdUrl}`), 방 만들기 폼(방 이름, 모드 라디오: 엑셀/일반 합방, 방장 닉네임), 링크 모음 페이지(5개 링크 + 각 "복사" 버튼 + 용도 설명: "멤버에게 보내기", "OBS에 넣기", "보조 운영자에게 주기", "방장 출연용", "방장 콘솔"). 링크 모음 페이지 상단에 "이 페이지 주소를 즐겨찾기 하세요. 잃어버리면 콘솔에 들어올 수 없습니다"를 표시한다.
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 👤 사용자 확인** — `npm run dev` 후 http://localhost:3000 에서 방을 만들고, 링크 5개가 보이며 "복사"가 동작하면 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: create show and link page"`

---

### Task 4: 입장 토큰과 2인 화상 연결

**Files:**
- Create: `src/lib/livekit/gateway.ts`, `src/lib/livekit/fake.ts`, `src/lib/services/members.ts`, `src/lib/services/tokens.ts`, `src/app/api/shows/[showId]/[...action]/route.ts`, `src/app/s/[showId]/join/[inviteSecret]/page.tsx`, `src/app/s/[showId]/m/[memberSecret]/page.tsx`, `src/components/StageRenderer.tsx`(임시: 단순 그리드)
- Test: `tests/lib/services/tokens.test.ts`, `tests/lib/services/members.test.ts`

**Interfaces:**
- Consumes: `ShowRepo`, `resolveAccess`
- Produces:

```ts
export interface LiveKitGateway {
  createToken(p: { room: string; identity: string; name: string; canPublish: boolean; hidden: boolean; metadata: string }): Promise<string>;
  sendData(room: string, payload: Uint8Array): Promise<void>;   // reliable
  removeParticipant(room: string, identity: string): Promise<void>; // 방에 없으면 조용히 무시
}
export function createLiveKitGateway(): LiveKitGateway; // livekit-server-sdk AccessToken + RoomServiceClient
export function createFakeGateway(): LiveKitGateway & { sent: unknown[]; removed: string[] };

// 방 이름 = showId. 참가자 identity 규칙:
//   멤버(방장 포함) = member.id, 방송 화면 = `output:${랜덤}`, 콘솔 = `console:${랜덤}`
export function issueToken(deps: { repo: ShowRepo; lk: LiveKitGateway }, showId: string, secret: string):
  Promise<{ token: string; url: string; identity: string; role: 'member' | 'output' | 'console' }>;
//  member: canPublish true, hidden false / output·console: canPublish false, hidden true
//  비밀값이 틀리거나 내보낸 멤버면 Error('FORBIDDEN')

export function registerMember(deps: { repo: ShowRepo }, showId: string, inviteSecret: string, displayName: string):
  Promise<{ memberSecret: string }>; // 닉네임 1~20자, 같은 쇼에서 중복 닉네임 금지 → Error('NAME_TAKEN')
```

API 경로(모두 `POST /api/shows/{showId}/{action}`, 본문에 `secret`):
`token`, `register`. 이후 Task에서 같은 라우터에 action을 추가한다. 서비스 함수의 `Error` 코드를 HTTP로 바꾸는 규칙: `FORBIDDEN`→403, `NOT_FOUND`→404, `INVALID_*`/`NAME_TAKEN`→400, `NO_EPISODE`→409.

- [ ] **Step 1: 실패하는 테스트** — `tokens.test.ts`:

```ts
test('같은 멤버 비밀값으로 토큰을 다시 받으면 identity가 같다', async () => {
  const a = await issueToken(deps, showId, memberSecret);
  const b = await issueToken(deps, showId, memberSecret);
  expect(a.identity).toBe(b.identity);
  expect(a.identity).toBe(memberId);
});
test('내보낸 멤버는 토큰을 받을 수 없다', async () => {
  await repo.updateMember(memberId, { kicked: true });
  await expect(issueToken(deps, showId, memberSecret)).rejects.toThrow('FORBIDDEN');
});
test('방송 화면 토큰은 숨김이고 송출 권한이 없다', async () => { /* fake gateway에 기록된 인자 확인: hidden true, canPublish false */ });
test('초대 비밀값으로는 토큰을 받을 수 없다', async () => { /* FORBIDDEN */ });
```

`members.test.ts`: 닉네임 중복 시 `NAME_TAKEN`, 21자 이상 `INVALID_NAME`, 정상 등록 시 `joinedOrder`가 2(방장 다음).
- [ ] **Step 2: 실패 확인** — `npm test` → FAIL.
- [ ] **Step 3: 구현** — 게이트웨이, 서비스, 라우터. 초대 페이지: 닉네임 입력 → `register` → `/s/{id}/m/{memberSecret}`로 이동하고, "이 주소가 내 출연 링크입니다. 다음 회차에도 이 주소로 들어오세요"를 안내한다. 출연 페이지: `token` 요청 → `LiveKitRoom`(`@livekit/components-react`)으로 입장, 카메라·마이크 켜기, 다른 참가자 타일을 단순 그리드로 표시한다. 방 옵션은 Global Constraints의 화질·마이크 값을 따른다.
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 배포** — `git push` → Vercel 자동 배포.
- [ ] **Step 6: 👤 사용자 확인** — 배포 주소에서 방을 만들고, PC에서 "방장 출연" 링크로, 휴대폰(또는 다른 PC)에서 초대 링크로 들어간다. 서로 얼굴이 보이고 대화가 되면 통과. (휴대폰은 v1의 보장 대상은 아니지만 확인용으로 충분합니다.)
- [ ] **Step 7: Commit** — `git commit -m "feat: join flow and two-person call"`

---

### Task 5: 실시간 상태 공유(스냅샷)

**Files:**
- Create: `src/lib/realtime/messages.ts`, `src/lib/realtime/publish.ts`, `src/lib/services/snapshot.ts`, `src/hooks/useShowState.ts`
- Test: `tests/lib/realtime/messages.test.ts`, `tests/lib/services/snapshot.test.ts`

**Interfaces:**
- Consumes: `ShowRepo`, `LiveKitGateway.sendData`
- Produces:

```ts
export type RealtimeMessage =
  | { type: 'snapshot'; snapshot: ShowSnapshot }
  | { type: 'donation'; donation: Donation; memberName: string }
  | { type: 'alert-skip' };
export function encodeMessage(m: RealtimeMessage): Uint8Array;
export function decodeMessage(b: Uint8Array): RealtimeMessage | null; // 형식이 틀리면 null

export function buildSnapshot(repo: ShowRepo, showId: string): Promise<ShowSnapshot>; // version = Date.now()
export function publishSnapshot(deps: { repo: ShowRepo; lk: LiveKitGateway }, showId: string): Promise<ShowSnapshot>;
export function publishMessage(lk: LiveKitGateway, showId: string, m: RealtimeMessage): Promise<void>;

// 클라이언트
export function useShowState(initial: ShowSnapshot): { snapshot: ShowSnapshot; lastDonation: { donation: Donation; memberName: string } | null; skipCount: number };
// 받은 스냅샷의 version이 현재보다 작거나 같으면 무시한다.
```

API: `POST snapshot`(어떤 역할이든 유효한 비밀값이면 스냅샷 반환, 초대 비밀값 제외).

- [ ] **Step 1: 실패하는 테스트** — `encodeMessage`→`decodeMessage` 왕복이 같은 값; 깨진 바이트·알 수 없는 `type`은 `null`; `buildSnapshot`이 멤버 목록·합계·현재 시즌을 담고 내보낸 멤버도 목록에는 포함(콘솔 표시용)한다.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 위 인터페이스. `useShowState`는 `useRoomContext()`의 `RoomEvent.DataReceived`를 구독하고, 재접속(`RoomEvent.Reconnected`) 시 `snapshot` API를 다시 불러 최신화한다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: realtime snapshot channel"`

(사용자 확인은 콘솔이 생기는 Task 6에서 함께 합니다.)

---

### Task 6: 방장 콘솔 기본

**Files:**
- Create: `src/app/s/[showId]/host/[secret]/page.tsx`, `src/components/console/MemberList.tsx`, `src/components/console/LinkPanel.tsx`, `src/components/console/ModePanel.tsx`
- Modify: `src/lib/services/members.ts`, `src/lib/services/shows.ts`, API 라우터
- Test: `tests/lib/services/control.test.ts`

**Interfaces:**
- Consumes: `canControl`, `publishSnapshot`, `LiveKitGateway.removeParticipant`
- Produces (모두 `secret`이 host/operator가 아니면 `FORBIDDEN`, 성공 후 `publishSnapshot`):

```ts
export function setOnAirMuted(deps, showId, secret, memberId: string, muted: boolean): Promise<void>;
export function setSpotlight(deps, showId, secret, memberId: string | null): Promise<void>;
export function kickMember(deps, showId, secret, memberId: string): Promise<void>; // kicked=true + removeParticipant. 방장(role host)은 내보낼 수 없음 → Error('INVALID_TARGET')
export function setMode(deps, showId, secret, patch: { mode?: ShowMode; gridVariant?: GridVariant }): Promise<void>;
export function rotateLink(deps, showId, secret, kind: 'operator' | 'output' | 'invite'): Promise<ShowLinks>;
// 운영자는 rotateLink를 쓸 수 없음 → FORBIDDEN (방장 링크 재발급은 v1 범위 밖)
```

API action: `mute`, `spotlight`, `kick`, `mode`, `rotate`.

**방송 음소거 동작:** LiveKit 서버 음소거를 쓰지 않는다. `onAirMuted=true`인 멤버의 소리는 방송 화면과 다른 멤버 화면에서 볼륨 0으로 재생한다. 본인 화면에는 "방송 음소거 중" 배지를 띄운다. 방장이 언제든 다시 켤 수 있다.

- [ ] **Step 1: 실패하는 테스트** — 운영자 비밀값으로 `setOnAirMuted` 성공·멤버 비밀값으로는 `FORBIDDEN`; `kickMember` 후 `fake.removed`에 멤버 id가 있고 `issueToken`이 `FORBIDDEN`; 방장 내보내기는 `INVALID_TARGET`; 운영자의 `rotateLink`는 `FORBIDDEN`; 각 제어 후 `fake.sent`에 snapshot 메시지 1건.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 서비스와 콘솔 화면. 콘솔은 숨김 참가자(`console:`)로 방에 들어가 `useShowState`로 실시간 반영한다. 멤버마다 큰 버튼 3개(🔇 방송 음소거 / ⭐ 강조 / 내보내기, 내보내기는 확인창). 화면 폭 400px(휴대폰)에서도 버튼이 한 손가락으로 눌릴 크기(최소 48px)로 만든다. 접속 중 여부(방에 있는 참가자 identity와 멤버 id 비교)를 초록/회색 점으로 표시한다. 멤버 출연 화면은 `onAirMuted`인 참가자 볼륨을 0으로 둔다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 👤 사용자 확인** — 두 기기로 입장한 상태에서 PC 다른 창에 방장 콘솔을 연다. ① 멤버 목록에 두 사람이 초록 점으로 보인다 ② 상대를 🔇하면 내 출연 화면에서 상대 소리가 꺼지고, 다시 누르면 돌아온다 ③ 내보내기를 누르면 상대가 튕기고 같은 링크로 다시 들어오지 못한다. 셋 다 되면 통과. 휴대폰으로 콘솔 링크를 열어 버튼이 누르기 편한지도 봐 주세요.
- [ ] **Step 6: Commit** — `git commit -m "feat: host console basics"`

---

### Task 7: 방송 화면, 일반 합방 모드, 소리 믹스, OBS 연결

**Files:**
- Create: `src/lib/modes/types.ts`, `src/lib/modes/grid.ts`, `src/lib/modes/index.ts`, `src/lib/seats/assign.ts`, `src/app/s/[showId]/out/[secret]/page.tsx`
- Modify: `src/components/StageRenderer.tsx`(임시 그리드 → Layout 기반), 멤버 출연 페이지, 링크 모음 페이지(OBS 안내 추가)
- Test: `tests/lib/modes/grid.test.ts`, `tests/lib/seats/assign.test.ts`

**Interfaces:**
- Consumes: `ShowSnapshot`, `useShowState`
- Produces:

```ts
export interface Tile { memberId: string; x: number; y: number; w: number; h: number; z: number; emphasis: 'none' | 'spotlight' | 'donation' }
// 좌표는 캔버스 픽셀(1920×1080)
export interface Layout { tiles: Tile[]; showLeaderboard: boolean; leaderboardRect: { x: number; y: number; w: number; h: number } | null }
export interface LayoutInput {
  snapshot: ShowSnapshot;
  onAir: Member[];                    // assignSeats 결과(순서 있음)
  recentDonationMemberId: string | null;
  canvas: { w: 1920; h: 1080 };
}
export interface ModeDefinition { id: ShowMode; orderMembers(s: ShowSnapshot): Member[]; layout(i: LayoutInput): Layout }
export const MODES: Record<ShowMode, ModeDefinition>;

export function assignSeats(ordered: Member[], onAirLimit: number): { onAir: Member[]; waiting: Member[] };
// 규칙: kicked 제외 → manualSeat 'on_air' 먼저(정원 초과 허용) → manualSeat null을 순서대로 정원까지 → 나머지와 manualSeat 'waiting'은 대기석
// 같은 id가 두 번 들어오면 한 번만 센다
```

`grid` 모드: `orderMembers`는 `joinedOrder` 오름차순. `gridVariant==='grid'`: n명을 `cols = ceil(sqrt(n))`, `rows = ceil(n/cols)` 칸에 균등 배치. `'spotlight'`: 강조 멤버가 왼쪽 75% 폭 전체 높이, 나머지는 오른쪽 25% 폭에 세로로 균등 배치(강조 멤버가 없거나 출연석에 없으면 grid와 같음). `recentDonationMemberId`의 타일은 `emphasis: 'donation'`(테두리 효과만, 크기 변화 없음). `showLeaderboard: false`.

**방송 화면 동작:** 숨김 참가자로 입장, 송출하지 않음. 출연석 멤버의 영상만 구독하고 대기석 영상은 구독 해제한다. 소리는 모든 멤버를 재생하되 `volume`을 적용하고, `onAirMuted`는 0, `muteWaiting`이면 대기석은 0, `excludeHostAudio`면 방장(role host)은 0이다. 브라우저 자동재생 정책 때문에 화면 첫 로드 시 소리가 막히면 "클릭해서 소리 켜기" 오버레이를 띄운다(OBS 브라우저 소스는 자동재생 허용이므로 OBS에서는 보이지 않음). 비디오가 없는 멤버의 타일은 닉네임이 큰 글씨로 적힌 빈 칸으로 그린다.

- [ ] **Step 1: 실패하는 테스트** — `grid.test.ts`:

```ts
test('n명 그리드는 겹치지 않고 캔버스 안에 있다', () => { /* n=1..13 각각: 모든 타일이 0≤x, x+w≤1920, 0≤y, y+h≤1080, 서로 겹침 없음 */ });
test('스포트라이트 멤버가 가장 큰 타일', () => { /* w*h 최대 타일의 memberId === spotlightMemberId */ });
test('카메라 트랙이 없는 멤버도 타일을 받는다', () => { /* layout은 멤버 목록만 보고 계산하므로 출연석 인원 수 === tiles.length */ });
```

`assign.test.ts`:

```ts
test('정원 12명이면 13번째는 대기석', () => { /* 13명 → onAir 12, waiting 1(마지막) */ });
test('수동 출연석은 정원을 넘어도 출연', () => { /* 12명 + 13번째 manualSeat on_air → onAir 13 */ });
test('수동 대기석은 정원이 남아도 대기', () => {});
test('내보낸 멤버는 어디에도 없다', () => {});
test('멤버 목록에 같은 id가 두 번 있어도 타일은 하나', () => {});
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 위 규칙대로 모드·좌석·방송 화면·`StageRenderer`. `StageRenderer`는 1920×1080 박스를 화면 크기에 맞춰 `transform: scale()`로 줄여 그린다(멤버 출연 화면도 같은 컴포넌트로 방송 구도를 미리 본다). 콘솔 `ModePanel`에 "그리드 / 스포트라이트" 전환 버튼과 "방장 소리 빼기", "대기석 음소거" 토글, 출연석 정원 입력을 추가한다(API action `settings`, 서비스 `updateSettings(deps, showId, secret, patch: Partial<Pick<Show,'onAirLimit'|'excludeHostAudio'|'muteWaiting'>>)`, `onAirLimit`은 1~50 정수가 아니면 `INVALID_LIMIT`). 멤버 목록에 출연석/대기석 표시와 "출연석으로 / 대기석으로 / 자동" 버튼(action `seat`, 서비스 `setManualSeat(deps, showId, secret, memberId, seat: Seat | null)`)을 추가한다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: OBS 안내문** — 링크 모음 페이지에 "OBS 설정" 상자를 추가한다: ① 소스 추가 → 브라우저 → 방송 화면 링크 붙여넣기 ② 너비 1920, 높이 1080 ③ "OBS를 통해 오디오 제어" 체크 ④ **방장 마이크를 OBS에 따로 추가하지 마세요(소리가 두 번 들어갑니다). 꼭 써야 하면 콘솔에서 '방장 소리 빼기'를 켜세요.**
- [ ] **Step 6: 👤 사용자 확인** — OBS에 방송 화면 링크를 브라우저 소스로 넣는다. ① 두 사람의 화면이 그리드로 보인다 ② 콘솔에서 스포트라이트를 누르면 한 사람이 크게 바뀐다 ③ OBS 오디오 믹서에 브라우저 소스 소리가 움직인다 ④ OBS 녹화 버튼으로 30초 녹화해 보고 소리가 한 번씩만 들리면 통과.
- [ ] **Step 7: 성능 측정** — Claude가 브라우저 탭 여러 개로 가짜 멤버 6명을 넣고(카메라 대신 테스트 영상 사용), 사용자는 OBS가 켜진 상태에서 작업 관리자의 CPU 사용률을 알려준다. 결과를 `docs/notes/performance.md`에 적는다. 80%를 넘으면 방송 화면이 받는 화질을 한 단계 낮추는 설정(`VideoQuality.MEDIUM`)을 기본값으로 바꾼다.
- [ ] **Step 8: Commit** — `git commit -m "feat: output page, grid mode, audio mix, OBS guide"`

---

### Task 8: 테스트 후원과 알림

**Files:**
- Create: `src/lib/services/donations.ts`, `src/lib/services/episodes.ts`, `src/lib/alerts/queue.ts`, `src/lib/alerts/chime.ts`, `src/components/AlertBanner.tsx`, `src/components/console/DonationPanel.tsx`, `src/components/console/EpisodePanel.tsx`
- Test: `tests/lib/services/donations.test.ts`, `tests/lib/alerts/queue.test.ts`

**Interfaces:**
- Consumes: `ShowRepo.addDonation`, `publishSnapshot`, `publishMessage`
- Produces:

```ts
export interface DonationInput { memberId: string; donorName: string; amount: number; message: string }
export function addTestDonation(deps, showId, secret, input: DonationInput): Promise<Donation>;
// 검증: amount 1,000~10,000,000 정수(아니면 INVALID_AMOUNT), donorName 1~20자(빈 값이면 '테스트 후원자'), message 0~100자,
//       멤버가 이 쇼 소속이고 내보내지 않았을 것(INVALID_TARGET), 진행 중 회차가 있을 것(NO_EPISODE)
// 저장 후 publishMessage({type:'donation'}) → publishSnapshot
export function startEpisode(deps, showId, secret): Promise<Episode>; // 이미 진행 중이면 그 회차를 그대로 반환
export function endEpisode(deps, showId, secret): Promise<Episode | null>;
export function skipAlert(deps, showId, secret): Promise<void>;   // publishMessage({type:'alert-skip'})

export interface AlertItem { id: string; memberName: string; donorName: string; amount: number; message: string }
export function createAlertQueue(): {
  push(a: AlertItem): void; current(): AlertItem | null; next(): void; size(): number;
};
export const ALERT_DURATION_MS = 6000;
export function playChime(ctx: AudioContext): void; // 두 음(880Hz → 1320Hz, 각 150ms) 짧은 효과음
```

API action: `donate`, `episode/start`, `episode/end`, `alert/skip`.

- [ ] **Step 1: 실패하는 테스트**:

```ts
test('회차를 시작하지 않으면 후원을 넣을 수 없다', async () => { await expect(addTestDonation(...)).rejects.toThrow('NO_EPISODE'); });
test('후원 두 건을 동시에 넣으면 합계가 두 건 모두 반영된다', async () => {
  await Promise.all([addTestDonation(d, id, host, { memberId, donorName: 'a', amount: 10000, message: '' }),
                     addTestDonation(d, id, host, { memberId, donorName: 'b', amount: 5000, message: '' })]);
  const t = (await repo.getTotals(id, seasonId, episodeId)).find(x => x.memberId === memberId)!;
  expect(t.season).toBe(15000);
});
test('금액 999원과 소수점은 거절', async () => { /* INVALID_AMOUNT */ });
test('후원 후 donation 메시지가 snapshot 메시지보다 먼저 나간다', async () => { /* fake.sent 순서 */ });
test('저장되는 출처는 test', async () => {});
```

`queue.test.ts`: `알림 큐는 연속 입력을 모두 순서대로 보관한다`(5건 push → current가 1번, next 4번 후 5번, 한 번 더 next 하면 null).
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 서비스, 큐, 알림음, `AlertBanner`(방송 화면 하단 중앙, 큰 글씨 "{후원자}님이 {멤버}에게 {금액}원!" + 메시지, 6초 후 다음 알림; `alert-skip`을 받으면 즉시 다음). 방송 화면과 멤버 출연 화면 둘 다 `AlertBanner`와 알림음을 쓴다. 알림이 나오는 동안 해당 멤버 타일을 `recentDonationMemberId`로 강조한다. 콘솔: 회차 시작/종료 큰 버튼, 후원 패널(멤버 선택 큰 버튼 + 금액 빠른 버튼 1천/1만/5만/10만 + 후원자명·메시지 입력 + "보내기"), "알림 넘기기" 버튼.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 👤 사용자 확인** — 콘솔에서 "방송 시작" → 상대 멤버에게 1만원 테스트 후원. ① OBS 화면과 두 출연 화면에 동시에 알림과 효과음이 나온다 ② 후원 버튼을 5번 빠르게 누르면 알림 5개가 차례로 나온다 ③ "알림 넘기기"를 누르면 바로 다음 알림으로 넘어간다. 셋 다 되면 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: test donations, alerts, episodes"`

---

### Task 9: 엑셀 모드(순위, 순위표, 순위별 배치)

**Files:**
- Create: `src/lib/ranking/rank.ts`, `src/lib/modes/excel.ts`, `src/components/Leaderboard.tsx`
- Modify: `src/lib/modes/index.ts`, 방송 화면, 콘솔(순위 미리보기)
- Test: `tests/lib/ranking/rank.test.ts`, `tests/lib/modes/excel.test.ts`

**Interfaces:**
- Consumes: `MemberTotal`, `ModeDefinition`, `assignSeats`
- Produces:

```ts
export interface RankedMember { member: Member; rank: number; amount: number }
export function rankMembers(members: Member[], totals: MemberTotal[], scope: 'season' | 'episode'): RankedMember[];
// kicked 제외. 정렬: amount 내림차순 → lastDonationAt 오름차순(null은 뒤) → joinedOrder 오름차순.
// rank는 1부터 연속 번호(동점이어도 위 규칙으로 갈린 순서대로 1,2,3…)
export const EXCEL: ModeDefinition; // orderMembers = rankMembers(..., 'season') 순서
export function rankTitle(rank: number): string; // 1 '회장', 2 '부회장', 3 '사장', 4 '전무', 5 '상무', 6 '부장', 7 '차장', 8 '과장', 9 '대리', 그 외 '사원'
```

엑셀 레이아웃(캔버스 1920×1080):
- 오른쪽 400px 폭 전체 높이 = 순위표 영역(`leaderboardRect = {x:1520, y:0, w:400, h:1080}`, `showLeaderboard: true`).
- 왼쪽 1520×1080 = 타일 영역. 출연 1명: 영역 전체. 2명 이상: 1위가 영역 왼쪽 절반(760×1080), 나머지 n-1명은 오른쪽 절반(760×1080)에 grid 규칙(`cols = ceil(sqrt(n-1))`)으로 배치.
- 스포트라이트가 켜져 있으면 grid 모드의 spotlight 배치를 타일 영역 안에서 그대로 쓴다(방장 수동 지정이 모드 계산보다 우선).
- 각 타일 하단에 "{직급} {닉네임}" 이름표를 그린다(StageRenderer가 Tile 옆에 넘겨받은 순위 정보로 표시).

순위표: 상단 "시즌 {n} 누적", 순위·직급·닉네임·누적액(천 단위 콤마) 목록, 하단 작은 글씨로 "이번 회차" 상위 3명. 출연석 정원 밖 멤버도 순위표에는 모두 나온다(대기석은 흐리게).

- [ ] **Step 1: 실패하는 테스트**:

```ts
test('금액이 큰 순서', () => {});
test('동점이면 마지막 후원 시각이 이른 멤버가 위', () => {
  // A: 10000, last 10:00 / B: 10000, last 09:59 → B가 1위
});
test('후원이 없으면 입장 순서', () => {});
test('내보낸 멤버는 순위에서 빠진다', () => {});
test('회차 기준 순위는 episode 금액으로 계산', () => {});
test('엑셀 배치: 1위 타일이 가장 크고 순위표 영역과 겹치지 않는다', () => { /* n=1..13 */ });
test('엑셀 배치: 스포트라이트가 켜지면 강조 멤버가 가장 크다', () => {});
test('rankTitle', () => { expect(rankTitle(1)).toBe('회장'); expect(rankTitle(10)).toBe('사원'); });
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 위 규칙. 순위가 바뀔 때 타일 이동에 `transition: all 600ms`를 줘서 자리가 미끄러지듯 바뀌게 한다. 콘솔에 현재 순위 미리보기(작은 순위표)를 넣는다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 👤 사용자 확인** — 엑셀 모드 방에서 멤버 3명(창 3개도 가능)으로 입장해 후원을 번갈아 넣는다. ① 순위표 숫자가 바로 바뀐다 ② 1위가 바뀌면 큰 자리로 화면이 이동한다 ③ 모든 창을 새로고침해도 순위가 그대로다. 셋 다 되면 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: excel mode ranking and layout"`

---

### Task 10: 시즌·회차 관리, 순위 보정, CSV, 테스트 데이터 삭제

**Files:**
- Create: `src/lib/export/csv.ts`, `src/components/console/SeasonPanel.tsx`
- Modify: `src/lib/services/episodes.ts`, `src/lib/services/donations.ts`, API 라우터
- Test: `tests/lib/export/csv.test.ts`, `tests/lib/services/season.test.ts`

**Interfaces:**
- Produces:

```ts
export function startNewSeason(deps, showId, secret): Promise<Season>;    // 진행 중 회차가 있으면 INVALID_STATE
export function addAdjustment(deps, showId, secret, input: { memberId: string; amount: number; reason: string }): Promise<Donation>;
// 순위표 수동 보정. amount는 0이 아닌 정수(음수 허용, 절댓값 ≤ 10,000,000), reason 1~50자 필수.
// source 'adjustment', donorName '보정', message = reason. 알림은 내보내지 않고 스냅샷만 방송.
export function deleteTestDonations(deps, showId, secret): Promise<number>; // 방장만(운영자 FORBIDDEN)
export function exportCsv(deps, showId, secret, filter: { seasonId?: string; episodeId?: string }): Promise<string>;
export function toCsv(rows: Array<{ createdAt: string; season: number; episode: number; memberName: string; donorName: string; amount: number; message: string; source: DonationSource }>): string;
// 헤더: 시각,시즌,회차,멤버,후원자,금액,메시지,출처 — UTF-8 BOM(﻿)으로 시작, 시각은 Asia/Seoul 'YYYY-MM-DD HH:mm:ss',
// 쉼표·따옴표·줄바꿈이 든 값은 큰따옴표로 감싸고 내부 따옴표는 두 번, 출처는 테스트/보정/투네이션
```

API: action `season/start`, `adjust`, `donations/delete-test`, 그리고 `GET /api/shows/{showId}/export/{secret}?seasonId=&episodeId=` → `text/csv` 다운로드(파일명 `donations-s{시즌}-e{회차 또는 all}.csv`).

- [ ] **Step 1: 실패하는 테스트** — `toCsv`가 BOM으로 시작하고 `"안녕, ""하세요"""`처럼 이스케이프; 새 시즌 시작 후 `rankMembers(..., 'season')` 금액이 모두 0이고 지난 시즌 내역은 `listDonations({seasonId: 이전})`로 그대로 남음; 회차 진행 중 새 시즌은 `INVALID_STATE`; 보정 -5000이 시즌 합계에 반영되고 `donation` 메시지는 나가지 않음; 운영자의 `deleteTestDonations`는 `FORBIDDEN`.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 서비스, 라우트, 콘솔 `SeasonPanel`(현재 시즌·회차 표시, "새 시즌 시작"(확인창: "현재 시즌 순위를 마감합니다"), 시즌/회차별 CSV 내려받기 버튼, 멤버별 "보정" 입력, "테스트 후원 전체 삭제"(확인창에 지울 건수 표시)).
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 👤 사용자 확인** — ① 회차 1에서 후원 → 방송 종료 → 회차 2 시작 후 후원 → 순위표의 시즌 누적은 합쳐지고 이번 회차는 회차 2만 보인다 ② CSV를 받아 엑셀로 열었을 때 한글이 깨지지 않는다 ③ "새 시즌 시작" 후 순위가 0부터 시작한다. 셋 다 되면 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: seasons, adjustments, csv export, test data cleanup"`

---

### Task 11: 입장 전 장비 점검과 오디오 다듬기

**Files:**
- Create: `src/components/PreJoin.tsx`, `src/lib/audio/headset.ts`, `src/components/console/VolumePanel.tsx`
- Modify: 멤버 출연 페이지, 콘솔, API 라우터
- Test: `tests/lib/audio/headset.test.ts`, `tests/lib/services/volume.test.ts`

**Interfaces:**
- Produces:

```ts
export function looksLikeHeadset(deviceLabel: string): boolean;
// 대소문자 무시, 다음 중 하나 포함 시 true: headset, headphone, earphone, earbud, airpods, buds, 헤드셋, 헤드폰, 이어폰, 이어버드, hands-free, bluetooth
export function setVolume(deps, showId, secret, memberId: string, volume: number): Promise<void>; // 0~2, 범위 밖 INVALID_VOLUME
```

API action `volume`.

- [ ] **Step 1: 실패하는 테스트** — `looksLikeHeadset('Galaxy Buds2 Pro')` true, `'스피커(Realtek High Definition Audio)'` false, `'Headphones (WH-1000XM5)'` true; `setVolume(2.1)`은 `INVALID_VOLUME`.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — `PreJoin`: 카메라 미리보기, 마이크 입력 막대, 기기 선택, 헤드셋 안내 문구("스피커로 들으면 다른 멤버 목소리가 방송에 메아리로 들어갑니다. 반드시 이어폰이나 헤드셋을 써 주세요"). 출력 장치 이름이 헤드셋처럼 보이지 않으면 "헤드셋을 착용했습니다" 체크를 해야 입장 버튼이 켜진다. 회선 점검은 LiveKit 연결 후 `ConnectionQuality`를 표시하고, `Poor`면 "유선 인터넷을 권장합니다" 경고를 띄운다. 콘솔 `VolumePanel`은 멤버별 슬라이더(0~200%)와 실시간 말하기 표시(`isSpeaking`)를 보여준다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 👤 사용자 확인** — ① 노트북 스피커 상태로 입장하려 하면 체크 요구가 뜨고, 이어폰을 꽂으면 바로 입장할 수 있다 ② 콘솔에서 한 멤버 볼륨을 50%로 내리면 OBS 미터가 작아진다. 둘 다 되면 통과.
- [ ] **Step 6: Commit** — `git commit -m "feat: prejoin checks, headset guard, per-member volume"`

---

### Task 12: 리허설 준비와 실전 리허설

**Files:**
- Create: `docs/notes/cost-estimate.md`, `docs/notes/rehearsal-checklist.md`, `docs/notes/rehearsal-findings.md`

- [ ] **Step 1: 비용 계산** — Claude가 LiveKit Cloud 요금표(작성 시점 기준)를 확인하고, "출연 12명 + 방송 화면 1 + 콘솔 1, 방송 3시간, 주 n회" 기준 월 예상 비용을 `cost-estimate.md`에 적는다. Task 7의 성능 측정값과 실제 LiveKit 대시보드 사용량도 함께 적는다.
- [ ] **Step 2: 👤 비용 확인** — 사용자가 금액을 보고 진행 여부를 정한다. 넘으면 출연석 정원이나 화질 상한을 조정한다.
- [ ] **Step 3: 체크리스트** — `rehearsal-checklist.md`: 멤버 사전 안내문(링크, 헤드셋, 유선 인터넷, 크롬 최신 버전), 방장 OBS 설정, 리허설 진행 순서(입장 → 회차 시작 → 테스트 후원 라운드 → 순위 변동 → 강조·음소거 → 1명 일부러 새로고침 → 회차 종료 → CSV), 문제 기록 양식.
- [ ] **Step 4: 👤 실전 리허설** — 엑셀 팀 실제 인원으로 비공개 송출(플랫폼 비공개 방송 또는 OBS 녹화)을 한다. 문제는 `rehearsal-findings.md`에 적는다. 이때 **팀의 실제 후원 수단 비중(별풍선·치즈·투네이션)**도 물어서 함께 기록한다(v2 범위 결정용).
- [ ] **Step 5: 수정 라운드** — 발견된 문제마다 별도 커밋으로 고친다. 소리 문제(에코, 끊김, 음량 차이)를 가장 먼저 고친다.
- [ ] **Step 6: v1 완료 판정** — 리허설 1회를 처음부터 끝까지 큰 문제 없이 마치면 v1 완료. 이후 v2(실 후원 연동) 설계를 새로 시작한다.
- [ ] **Step 7: Commit** — `git commit -m "docs: rehearsal notes and cost estimate"`
