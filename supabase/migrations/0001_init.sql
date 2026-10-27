-- 원격 합방 스튜디오 v1 테이블
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run.
-- 모든 테이블은 RLS를 켜고 정책을 두지 않는다: 서버(service role / secret key)만 접근한다.

create table shows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  mode text not null check (mode in ('excel', 'grid')),
  grid_variant text not null default 'grid' check (grid_variant in ('grid', 'spotlight')),
  on_air_limit integer not null default 12 check (on_air_limit between 1 and 50),
  exclude_host_audio boolean not null default false,
  mute_waiting boolean not null default false,
  spotlight_member_id uuid,
  current_season_id uuid,
  current_episode_id uuid,
  host_secret text not null unique,
  operator_secret text not null unique,
  output_secret text not null unique,
  invite_secret text not null unique,
  created_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  number integer not null,
  closed_at timestamptz,
  unique (show_id, number)
);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  number integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (season_id, number)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  role text not null default 'member' check (role in ('host', 'member')),
  kicked boolean not null default false,
  on_air_muted boolean not null default false,
  volume real not null default 1 check (volume between 0 and 2),
  manual_seat text check (manual_seat in ('on_air', 'waiting')),
  joined_order integer not null,
  secret text not null unique,
  created_at timestamptz not null default now(),
  unique (show_id, joined_order)
);

create table donations (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  episode_id uuid not null references episodes(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  donor_name text not null,
  amount integer not null check (amount <> 0),
  message text not null default '',
  source text not null check (source in ('test', 'adjustment', 'toonation')),
  created_at timestamptz not null default clock_timestamp()
);

create index donations_show_season on donations (show_id, season_id);

alter table shows enable row level security;
alter table seasons enable row level security;
alter table episodes enable row level security;
alter table members enable row level security;
alter table donations enable row level security;
