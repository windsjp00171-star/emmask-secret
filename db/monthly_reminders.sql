-- 每月固定提醒（recurring monthly reminders）
-- 在 Supabase SQL Editor 執行一次即可建立資料表。

create table if not exists monthly_reminders (
  id uuid primary key default gen_random_uuid(),
  day_of_month int not null check (day_of_month between 1 and 31),
  content text not null,
  project text,
  is_active boolean not null default true,
  -- 已提醒的年月（格式 YYYY-MM），避免同一個月重複提醒
  last_reminded_ym text,
  created_at timestamptz not null default now()
);

create index if not exists monthly_reminders_active_idx
  on monthly_reminders (is_active, day_of_month);
