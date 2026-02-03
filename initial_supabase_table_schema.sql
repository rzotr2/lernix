create table public.users (
  id uuid not null,
  email text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  is_deleted boolean null default false,
  deleted_at timestamp with time zone null,
  reactivated_at timestamp with time zone null,
  constraint users_pkey primary key (id),
  constraint users_id_fkey foreign KEY (id) references auth.users (id)
) TABLESPACE pg_default;

create table public.user_preferences (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  has_completed_onboarding boolean null default false,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint user_preferences_pkey primary key (id),
  constraint user_preferences_user_id_key unique (user_id),
  constraint user_preferences_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;


create table public.user_trials (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  trial_start_time timestamp with time zone null default now(),
  trial_end_time timestamp with time zone not null,
  is_trial_used boolean null default false,
  constraint user_trials_pkey primary key (id),
  constraint user_trials_user_id_key unique (user_id),
  constraint user_trials_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.subscriptions (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status text null,
  price_id text null,
  created_at timestamp with time zone null default now(),
  cancel_at_period_end boolean null default false,
  updated_at timestamp with time zone null default now(),
  current_period_end timestamp with time zone null,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_stats (
  user_id uuid not null,
  total_pages_count integer not null default 0,
  pages_with_ai_count integer not null default 0,
  total_ai_calls integer not null default 0,
  last_activity_at timestamp with time zone null,
  constraint user_stats_pkey primary key (user_id),
  constraint user_stats_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_activity_daily (
  user_id uuid not null,
  activity_date date not null,
  pages_created_count integer not null default 0,
  ai_calls_count integer not null default 0,
  constraint user_activity_daily_pkey primary key (user_id, activity_date),
  constraint user_activity_daily_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_recent_pages (
  user_id uuid not null,
  page_id uuid not null,
  last_accessed_at timestamp with time zone not null default now(),
  constraint user_recent_pages_pkey primary key (user_id, page_id),
  constraint user_recent_pages_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint user_recent_pages_page_id_fkey foreign KEY (page_id) references pages (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_page_ai_usage (
  user_id uuid not null,
  page_id uuid not null,
  first_ai_at timestamp with time zone not null default now(),
  constraint user_page_ai_usage_pkey primary key (user_id, page_id),
  constraint user_page_ai_usage_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint user_page_ai_usage_page_id_fkey foreign KEY (page_id) references pages (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_subscription_status (
  user_id uuid not null,
  trial_status text null,
  subscription_status text null,
  updated_at timestamp with time zone not null default now(),
  constraint user_subscription_status_pkey primary key (user_id),
  constraint user_subscription_status_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index user_activity_daily_user_date_idx on public.user_activity_daily (user_id, activity_date);
create index user_recent_pages_user_access_idx on public.user_recent_pages (user_id, last_accessed_at desc);
create index user_page_ai_usage_user_idx on public.user_page_ai_usage (user_id);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_recent_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_page_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscription_status ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can read their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role full access to users" ON public.users
  FOR ALL TO service_role USING (true);

-- User preferences policies
CREATE POLICY "Users can read their own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to preferences" ON public.user_preferences
  FOR ALL TO service_role USING (true);

-- User trials policies
CREATE POLICY "Users can read their own trials" ON public.user_trials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own trials" ON public.user_trials
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trials" ON public.user_trials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to trials" ON public.user_trials
  FOR ALL TO service_role USING (true);

-- Subscriptions policies
CREATE POLICY "Users can read their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to subscriptions" ON public.subscriptions
  FOR ALL TO service_role USING (true);

-- User stats policies
CREATE POLICY "Users can read their own stats" ON public.user_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stats" ON public.user_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats" ON public.user_stats
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_stats" ON public.user_stats
  FOR ALL TO service_role USING (true);

-- User activity daily policies
CREATE POLICY "Users can read their own daily activity" ON public.user_activity_daily
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily activity" ON public.user_activity_daily
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily activity" ON public.user_activity_daily
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_activity_daily" ON public.user_activity_daily
  FOR ALL TO service_role USING (true);

-- User recent pages policies
CREATE POLICY "Users can read their own recent pages" ON public.user_recent_pages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recent pages" ON public.user_recent_pages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recent pages" ON public.user_recent_pages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_recent_pages" ON public.user_recent_pages
  FOR ALL TO service_role USING (true);

-- User page AI usage policies
CREATE POLICY "Users can read their own AI usage pages" ON public.user_page_ai_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI usage pages" ON public.user_page_ai_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI usage pages" ON public.user_page_ai_usage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_page_ai_usage" ON public.user_page_ai_usage
  FOR ALL TO service_role USING (true);

-- User subscription status policies
CREATE POLICY "Users can read their own subscription status" ON public.user_subscription_status
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscription status" ON public.user_subscription_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription status" ON public.user_subscription_status
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_subscription_status" ON public.user_subscription_status
  FOR ALL TO service_role USING (true);
