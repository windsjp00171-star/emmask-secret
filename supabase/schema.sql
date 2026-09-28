-- EmmArk 小秘書：資料庫結構
--
-- 用法：Supabase → 左側 SQL Editor → New query → 整份貼上 → Run。
-- 可以重複執行，已經建好的表不會被影響（全部都是 if not exists）。

-- 筆記／待辦／提醒／記帳／名片……全部存在這張
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  type text not null check (type in ('task', 'reminder', 'note', 'project_update', 'expense', 'contact')),
  project text,
  content text not null,
  due_date timestamptz,
  is_done boolean default false,
  is_reminded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  recur text,
  remind_lead_minutes integer,
  meta jsonb
);
create index if not exists notes_type_created_idx on public.notes (type, created_at desc);
create index if not exists idx_notes_type on public.notes (type);
create index if not exists idx_notes_due_date on public.notes (due_date) where due_date is not null;
create index if not exists idx_notes_is_done on public.notes (is_done);

-- 服事表：主日日期、職位、每一格的人
create table if not exists public.worship_dates (
  id uuid primary key default gen_random_uuid(),
  service_date date not null unique,
  created_at timestamptz default now()
);

create table if not exists public.worship_roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.worship_schedule (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  role text not null,
  person_name text not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_worship_date on public.worship_schedule (service_date);
create index if not exists idx_worship_person on public.worship_schedule (person_name);
create index if not exists idx_worship_role on public.worship_schedule (role);

-- 小秘書的短暫狀態（存圖模式、AI 額度旗標……）
create table if not exists public.bot_state (
  key text primary key,
  value jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 排程心跳：提醒輪詢太久沒跑會在早安簡報示警
create table if not exists public.cron_heartbeats (
  name text primary key,
  last_run_at timestamptz not null default now()
);

-- 只有伺服器（service_role 金鑰）能讀寫，公開的 anon 金鑰什麼都看不到
alter table public.notes enable row level security;
alter table public.worship_dates enable row level security;
alter table public.worship_roles enable row level security;
alter table public.worship_schedule enable row level security;
alter table public.bot_state enable row level security;
alter table public.cron_heartbeats enable row level security;

-- 圖片存檔用的私有空間
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', false)
on conflict (id) do nothing;
