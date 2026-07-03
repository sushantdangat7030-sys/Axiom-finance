-- Axiom Finance — initial schema. Run in Supabase SQL editor (or supabase db push).
-- Every table is user-scoped with RLS; clients use the anon key + auth session.

create extension if not exists pg_trgm;

-- ============ users (profiles mirror of auth.users) ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ categories ============
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '🏷️',
  is_income boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- seed defaults for each new user
create or replace function seed_default_categories() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into categories (user_id, name, emoji, is_income, is_system) values
    (new.id,'Groceries','🛒',false,true),(new.id,'Dining','🍽️',false,true),
    (new.id,'Transport','🚕',false,true),(new.id,'Housing','🏠',false,true),
    (new.id,'Utilities','💡',false,true),(new.id,'Shopping','🛍️',false,true),
    (new.id,'Entertainment','🎬',false,true),(new.id,'Travel','✈️',false,true),
    (new.id,'Health','🩺',false,true),(new.id,'Subscriptions','🔁',false,true),
    (new.id,'Fees','🏦',false,true),(new.id,'Income','💰',true,true),
    (new.id,'Other','📦',false,true);
  return new;
end $$;
create trigger on_profile_created
  after insert on profiles
  for each row execute function seed_default_categories();

-- ============ connected_accounts (email / future bank connections) ============
create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  address text not null,                    -- email address connected
  access_token_enc text not null,           -- AES-256-GCM, never plaintext
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','error','revoked')),
  last_synced_at timestamptz,
  sync_cursor text,                         -- provider-specific incremental cursor
  created_at timestamptz not null default now(),
  unique (user_id, provider, address)
);

-- ============ transactions ============
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  description text,
  amount numeric(14,2) not null,            -- negative = expense, positive = income
  currency text not null default 'USD',
  date date not null,
  category_id uuid references categories(id) on delete set null,
  subcategory text,
  payment_method text,
  tags text[] not null default '{}',
  notes text,
  source text not null default 'manual'
    check (source in ('email','csv','xlsx','pdf','receipt','manual')),
  order_id text,
  external_id text,                         -- email msg id / file-row hash: idempotency
  connected_account_id uuid references connected_accounts(id) on delete set null,
  import_id uuid,
  confidence_score real not null default 1.0,
  review_needed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index txn_external_uniq on transactions (user_id, external_id)
  where external_id is not null;
create index txn_user_date on transactions (user_id, date desc);
create index txn_user_merchant_trgm on transactions using gin (merchant gin_trgm_ops);

-- ============ merchant_rules (rules + learning loop) ============
create table merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,                    -- lowercase substring matched against merchant
  category_id uuid not null references categories(id) on delete cascade,
  subcategory text,
  source text not null default 'user' check (source in ('user','system','learned')),
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

-- ============ subscriptions ============
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  frequency text not null check (frequency in ('weekly','biweekly','monthly','yearly')),
  next_billing_date date,
  last_seen_date date,
  monthly_cost numeric(14,2) not null,
  annual_cost numeric(14,2) not null,
  status text not null default 'active' check (status in ('active','cancelled','paused')),
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant, frequency)
);

-- ============ budgets ============
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

-- ============ email_sync_logs ============
create table email_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_account_id uuid references connected_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  emails_scanned integer not null default 0,
  transactions_found integer not null default 0,
  duplicates_skipped integer not null default 0,
  status text not null default 'running' check (status in ('running','ok','error')),
  error text
);

-- ============ import_history ============
create table import_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('csv','xlsx','pdf','receipt','email','manual')),
  file_name text,
  attachment_id uuid,
  rows_parsed integer not null default 0,
  inserted integer not null default 0,
  duplicates_skipped integer not null default 0,
  flagged integer not null default 0,
  status text not null default 'ok' check (status in ('ok','partial','error')),
  error text,
  created_at timestamptz not null default now()
);

-- ============ duplicate_alerts ============
create table duplicate_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  candidate_id uuid not null references transactions(id) on delete cascade,
  confidence text not null check (confidence in ('high','medium','low')),
  score real not null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open','merged','dismissed','auto_merged')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============ attachments ============
create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,               -- attachments/<user_id>/<uuid>.<ext>
  kind text not null check (kind in ('receipt','pdf','csv','xlsx','report')),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ RLS: user isolation on every table ============
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','connected_accounts','transactions',
    'merchant_rules','subscriptions','budgets','email_sync_logs','import_history',
    'duplicate_alerts','attachments']
  loop
    execute format('alter table %I enable row level security', t);
    if t = 'profiles' then
      execute 'create policy profiles_own on profiles for all using (auth.uid() = id) with check (auth.uid() = id)';
    else
      execute format(
        'create policy %I_own on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        t, t);
    end if;
  end loop;
end $$;

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger txn_touch before update on transactions
  for each row execute function touch_updated_at();
create trigger sub_touch before update on subscriptions
  for each row execute function touch_updated_at();

-- ============ Storage bucket + per-user folder policy ============
insert into storage.buckets (id, name, public) values ('attachments','attachments',false)
on conflict (id) do nothing;

create policy "attachments_rw_own" on storage.objects for all
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
