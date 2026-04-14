-- ============================================================
-- 宅建士 完全対策 - Supabase 初期スキーマ
-- すべてのテーブルに Row Level Security を有効化
-- ユーザーは自分のデータのみアクセス可能
-- ============================================================

-- ===== 1. profiles: auth.users と 1対1 =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'standard', 'unlimited')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- サインアップ時に profile を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== 2. question_progress: 問題別SM-2進捗 =====
create table if not exists public.question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  attempts int not null default 0,
  correct_count int not null default 0,
  last_attempt_at timestamptz not null default now(),
  bookmarked boolean not null default false,
  next_review_at timestamptz not null default now(),
  ease_factor numeric not null default 2.5,
  interval_days int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_progress enable row level security;

create policy "qp_select_own"
  on public.question_progress for select
  using (auth.uid() = user_id);

create policy "qp_insert_own"
  on public.question_progress for insert
  with check (auth.uid() = user_id);

create policy "qp_update_own"
  on public.question_progress for update
  using (auth.uid() = user_id);

create policy "qp_delete_own"
  on public.question_progress for delete
  using (auth.uid() = user_id);

-- ===== 3. study_stats: 学習統計 =====
create table if not exists public.study_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_questions int not null default 0,
  total_correct int not null default 0,
  total_study_time int not null default 0,
  streak int not null default 0,
  longest_streak int not null default 0,
  last_study_at timestamptz,
  category_stats jsonb not null default '{}'::jsonb,
  quick_quiz_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_stats enable row level security;

create policy "stats_select_own" on public.study_stats for select using (auth.uid() = user_id);
create policy "stats_insert_own" on public.study_stats for insert with check (auth.uid() = user_id);
create policy "stats_update_own" on public.study_stats for update using (auth.uid() = user_id);

-- ===== 4. exam_sessions: 模擬試験履歴 =====
create table if not exists public.exam_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  question_ids text[] not null,
  answers jsonb not null default '{}'::jsonb,
  flagged text[] not null default '{}',
  total int,
  correct int,
  submitted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.exam_sessions enable row level security;

create policy "exam_select_own" on public.exam_sessions for select using (auth.uid() = user_id);
create policy "exam_insert_own" on public.exam_sessions for insert with check (auth.uid() = user_id);
create policy "exam_update_own" on public.exam_sessions for update using (auth.uid() = user_id);
create policy "exam_delete_own" on public.exam_sessions for delete using (auth.uid() = user_id);

-- ===== 5. question_reports: 問題誤り報告 =====
create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  question_id text not null,
  reason text not null check (reason in ('wrong_answer', 'typo', 'unclear', 'outdated', 'other')),
  detail text,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

alter table public.question_reports enable row level security;

-- 匿名報告も許容: insert は誰でも、select/update は自分の報告のみ
create policy "reports_insert_any"
  on public.question_reports for insert
  with check (true);

create policy "reports_select_own"
  on public.question_reports for select
  using (auth.uid() = user_id);

-- ===== 6. delete_current_user RPC: アカウント削除 =====
create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 関連データを削除（CASCADEで自動削除されるがRLS回避のため明示）
  delete from public.question_progress where user_id = uid;
  delete from public.study_stats where user_id = uid;
  delete from public.exam_sessions where user_id = uid;
  delete from public.profiles where id = uid;

  -- auth.users からも削除
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

-- ===== 7. インデックス =====
create index if not exists idx_qp_user on public.question_progress(user_id);
create index if not exists idx_qp_review on public.question_progress(user_id, next_review_at);
create index if not exists idx_exam_user on public.exam_sessions(user_id, started_at desc);
create index if not exists idx_reports_question on public.question_reports(question_id, resolved);
