-- ============================================================
-- EQUIO – Der Ponyplaner: Datenbank-Setup
-- Diesen kompletten Code in Supabase -> SQL Editor -> "New query"
-- einfügen und auf "Run" klicken.
-- ============================================================

-- Profile: verknüpft jeden Login mit einem Anzeigenamen
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Pferde (gemeinsam sichtbar)
create table if not exists horses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  breed text,
  born text,
  owner text,
  note text,
  health jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Aufgaben (gemeinsam sichtbar)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'uebernahme', -- uebernahme | uebernahme_erledigt | info
  date date not null,
  time text,
  horse_ids uuid[] default '{}',
  assigned_user text,
  done boolean default false,
  recurring boolean default false,
  created_at timestamptz default now()
);

-- Gemeinsame Termine
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time text,
  created_at timestamptz default now()
);

-- Private Termine (nur für den jeweiligen Nutzer sichtbar)
create table if not exists personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  time text,
  created_at timestamptz default now()
);

-- Gemeinsame Ausgaben
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  date date not null,
  paid_by text not null,
  note text,
  created_at timestamptz default now()
);

-- Aufteilung der Ausgaben pro Person
create table if not exists expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_name text not null,
  amount numeric not null,
  status text not null default 'offen' -- offen | überwiesen | erhalten
);

-- Trainingstagebuch (tatsächlich durchgeführtes Training, gemeinsame Historie des Pferdes)
create table if not exists trainings (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  date date not null,
  art text not null,
  dauer_min integer,
  intensitaet text,
  notiz text,
  created_at timestamptz default now()
);

-- Trainingsplanung (privat, nur für die planende Person sichtbar)
create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  horse_id uuid not null references horses(id) on delete cascade,
  date date not null,
  plan text not null,
  created_at timestamptz default now()
);

-- Gesundheitsnotizen (freies Log, z.B. "steifes Becken", "Husten" – gemeinsame Historie)
create table if not exists health_notes (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses(id) on delete cascade,
  user_name text not null,
  date date not null,
  note text not null,
  created_at timestamptz default now()
);

-- Futterplan: ein gemeinsam bearbeitbares Textfeld pro Pferd
alter table horses add column if not exists feed_plan text;

-- ============================================================
-- Row Level Security aktivieren
-- ============================================================
alter table profiles enable row level security;
alter table horses enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table personal_events enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table trainings enable row level security;
alter table training_plans enable row level security;
alter table health_notes enable row level security;

-- Profile: jede:r sieht alle Namen (für Zuordnung), bearbeitet nur sich selbst
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- Gemeinsame Tabellen: alle angemeldeten Nutzer:innen dürfen lesen & schreiben
create policy "horses_all" on horses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "tasks_all" on tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "events_all" on events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "expenses_all" on expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "expense_splits_all" on expense_splits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "trainings_all" on trainings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "health_notes_all" on health_notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Private Termine & Trainingsplanung: nur der/die Ersteller:in sieht & bearbeitet eigene Einträge
create policy "personal_events_own" on personal_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "training_plans_own" on training_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Eure echten Pferde (Gesundheitsdaten trägst du später direkt in der App ein)
insert into horses (name, breed, born, owner, note, health) values
  ('Goldi', null, null, null, null, '{}'),
  ('Nanni', null, null, null, null, '{}'),
  ('Karl', null, null, null, null, '{}')
on conflict do nothing;
