-- GlassDrop server schema (Supabase / Postgres). Idempotent: safe to run again.
-- All money/randomness lives here; the client can only call the RPC functions below.

-- ============ static data ============
create table if not exists skins (
  id int primary key, tier text not null, r text not null, cat text not null,
  mn float8, mx float8, st boolean not null, star boolean not null, base numeric not null
);
alter table skins add column if not exists px numeric[];  -- real market prices: FN,MW,FT,WW,BS, then StatTrak FN..BS
create table if not exists cases (id text primary key, name text not null, price numeric not null, odds jsonb not null);
create table if not exists case_items (case_id text references cases on delete cascade, tier text not null, skin_id int references skins, primary key (case_id, skin_id));

-- ============ players ============
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null,
  balance numeric(14,2) not null default 100,
  last_bonus timestamptz,
  opened int not null default 0, spent numeric(14,2) not null default 0, sold numeric(14,2) not null default 0,
  up_w int not null default 0, up_l int not null default 0,
  battles_w int not null default 0, battles_l int not null default 0,
  best_price numeric(14,2) not null default 0, best_skin int, best_float float8, best_st boolean,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nick_uq on profiles (lower(nickname));
alter table profiles add column if not exists bonus_n int not null default 0;
alter table profiles add column if not exists xp int not null default 0;
alter table profiles add column if not exists quests jsonb not null default '{}';
alter table profiles add column if not exists daily_last date;
alter table profiles add column if not exists daily_streak int not null default 0;
alter table profiles add column if not exists pumpkin_done boolean not null default false;

-- pumpkin hunt: which of the 20 hidden pumpkins each player found
create table if not exists pumpkins (owner uuid not null references profiles on delete cascade, pid int not null, found_at timestamptz not null default now(), primary key (owner, pid));
alter table pumpkins enable row level security;

-- battle pass, perks (luck potions, free case openings), steam withdrawals, climb game
alter table profiles add column if not exists bp_claimed int[] not null default '{}';
alter table profiles add column if not exists luck_until timestamptz;
create table if not exists bp_rewards (level int primary key, kind text not null, amount numeric, case_id text, n int, skin_id int, code text, mins int);
create table if not exists perks (
  id bigserial primary key, owner uuid not null references profiles on delete cascade,
  kind text not null, case_id text, mins int, src text not null default 'pass', created_at timestamptz not null default now()
);
create index if not exists perks_owner on perks (owner);
create table if not exists steam_items (
  id bigserial primary key, owner uuid not null references profiles on delete cascade,
  skin_id int not null references skins, float float8, st boolean not null default false, price numeric(14,2) not null,
  src text, got_at timestamptz, withdrawn_at timestamptz not null default now()
);
create index if not exists steam_owner on steam_items (owner);
create table if not exists climbs (
  id bigserial primary key, user_id uuid references profiles on delete cascade, nickname text not null,
  bet numeric(14,2) not null, skins int not null default 0, target numeric(10,2) not null, crash numeric(10,2) not null,
  win boolean not null, payout numeric(14,2) not null default 0, created_at timestamptz not null default now()
);

-- unique visitors per day (for the traffic counter)
create table if not exists visits (day date not null default current_date, uid uuid not null, hits int not null default 1, primary key (day, uid));
alter table visits enable row level security;

create table if not exists inventory (
  id bigserial primary key,
  owner uuid not null references profiles on delete cascade,
  skin_id int not null references skins, float float8, st boolean not null default false,
  price numeric(14,2) not null, src text not null default 'case', created_at timestamptz not null default now()
);
create index if not exists inventory_owner on inventory (owner);

-- public feed: drops, upgrades, battles, gifts
create table if not exists drops (
  id bigserial primary key, user_id uuid, nickname text not null,
  skin_id int not null, float float8, st boolean not null default false, price numeric(14,2) not null,
  source text not null, case_id text, extra text, created_at timestamptz not null default now()
);

-- ============ battles ============
create table if not exists battles (
  id bigserial primary key, case_id text not null, rounds int not null, max_players int not null,
  cost numeric(14,2) not null, status text not null default 'open', -- open | done | cancelled
  creator uuid not null, creator_nick text not null, winner_slot int, total numeric(14,2),
  created_at timestamptz not null default now(), finished_at timestamptz
);
create table if not exists battle_players (
  id bigserial primary key, battle_id bigint not null references battles on delete cascade,
  user_id uuid, nickname text not null, slot int not null, is_bot boolean not null default false, total numeric(14,2),
  unique (battle_id, slot)
);
create unique index if not exists battle_players_user_uq on battle_players (battle_id, user_id) where user_id is not null;
create table if not exists battle_drops (
  id bigserial primary key, battle_id bigint not null references battles on delete cascade,
  slot int not null, round int not null, skin_id int not null, float float8, st boolean not null, price numeric(14,2) not null, tier text not null
);
create index if not exists battle_drops_b on battle_drops (battle_id);

-- ============ row level security: everyone reads, nobody writes directly ============
do $$ declare t text; begin
  foreach t in array array['skins','cases','case_items','profiles','inventory','drops','battles','battle_players','battle_drops','bp_rewards','perks','steam_items','climbs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all on %I', t);
    execute format('create policy read_all on %I for select using (true)', t);
  end loop;
end $$;

create or replace view leaderboard with (security_invoker = on) as
select p.id, p.nickname, p.balance, coalesce(i.v, 0)::numeric(14,2) as inv_value, (p.balance + coalesce(i.v, 0) + coalesce(sv.v, 0))::numeric(14,2) as networth,
       p.best_price, p.best_skin, p.best_float, p.best_st, p.opened, p.up_w, p.up_l, p.battles_w, p.battles_l
, p.xp, p.daily_streak, coalesce(sv.v, 0)::numeric(14,2) as steam_value
from profiles p left join (select owner, sum(price) v from inventory group by owner) i on i.owner = p.id
left join (select owner, sum(price) v from steam_items group by owner) sv on sv.owner = p.id;

-- realtime
do $$ declare t text; begin
  foreach t in array array['drops','battles','battle_players','inventory','profiles','climbs','perks'] loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ============ pricing & rolling helpers (internal) ============
create or replace function wear_code(f float8) returns text language sql immutable as $$
  select case when f is null then null when f < .07 then 'FN' when f < .15 then 'MW' when f < .38 then 'FT' when f < .45 then 'WW' else 'BS' end $$;

create or replace function price_code(p_skin int, p_code text, p_st boolean) returns numeric language plpgsql stable as $$
declare s skins; p numeric; k int;
begin
  select * into s from skins where id = p_skin;
  if s.px is not null then
    k := coalesce(array_position(array['FN','MW','FT','WW','BS'], p_code), 1) + case when p_st then 5 else 0 end;
    if s.px[k] is not null then return greatest(.03, s.px[k]); end if;
  end if;
  p := s.base;
  if p_code is not null then
    p := p * case when s.star then (case p_code when 'FN' then 1.7 when 'MW' then 1.2 when 'FT' then 1 when 'WW' then .9 else .82 end)
                  else (case p_code when 'FN' then 2.1 when 'MW' then 1.4 when 'FT' then 1 when 'WW' then .88 else .72 end) end;
  end if;
  if p_st then p := p * case when s.star then 1.15 else 2 end; end if;
  return greatest(.03, round(p, 2));
end $$;

create or replace function price_of(p_skin int, p_float float8, p_st boolean) returns numeric language plpgsql stable as $$
declare p numeric := price_code(p_skin, wear_code(p_float), p_st);
begin
  if p_float is not null and p_float < .01 then p := round(p * 1.25, 2); end if;
  return p;
end $$;

-- CS2 float: pick a wear bucket on 0..1, then remap into the skin's own range
create or replace function roll_float(p_skin int) returns float8 language plpgsql volatile as $$
declare s skins; x float8 := random(); lo float8; hi float8;
begin
  select * into s from skins where id = p_skin;
  if s.mn is null then return null; end if;
  if x < .03 then lo := 0; hi := .07; elsif x < .27 then lo := .07; hi := .15; elsif x < .60 then lo := .15; hi := .38;
  elsif x < .84 then lo := .38; hi := .45; else lo := .45; hi := 1; end if;
  return round((s.mn + (s.mx - s.mn) * (lo + (hi - lo) * random()))::numeric, 9)::float8;
end $$;

create or replace function roll_drop(p_case text) returns jsonb language plpgsql volatile as $$
declare o jsonb; x float8 := random(); k text; v text; t text; sid int; f float8; st boolean; s skins;
begin
  select odds into o from cases where id = p_case;
  if o is null then raise exception 'NO_CASE'; end if;
  for k, v in select key, value from jsonb_each_text(o) loop
    t := k; x := x - v::float8;
    exit when x < 0;
  end loop;
  select skin_id into sid from case_items where case_id = p_case and tier = t order by random() limit 1;
  select * into s from skins where id = sid;
  f := roll_float(sid);
  st := s.st and random() < .1;
  return jsonb_build_object('skin', sid, 'float', f, 'st', st, 'price', price_of(sid, f, st), 'tier', t);
end $$;

-- give an item to a player (+ best drop bookkeeping)
create or replace function grant_item(p_user uuid, d jsonb, p_src text) returns bigint language plpgsql as $$
declare iid bigint;
begin
  insert into inventory (owner, skin_id, float, st, price, src)
  values (p_user, (d->>'skin')::int, (d->>'float')::float8, (d->>'st')::boolean, (d->>'price')::numeric, p_src)
  returning id into iid;
  update profiles set best_price = (d->>'price')::numeric, best_skin = (d->>'skin')::int, best_float = (d->>'float')::float8, best_st = (d->>'st')::boolean
   where id = p_user and best_price < (d->>'price')::numeric;
  return iid;
end $$;

create or replace function me_nick() returns text language sql stable as $$ select nickname from profiles where id = auth.uid() $$;

-- ============ public API (RPC) ============
create or replace function ensure_profile(p_nick text) returns profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pr profiles; n text := btrim(p_nick);
begin
  if uid is null then raise exception 'NO_AUTH'; end if;
  select * into pr from profiles where id = uid;
  if found then return pr; end if;
  if n !~ '^[A-Za-zА-Яа-яЁё0-9_. -]{3,16}$' then raise exception 'BAD_NICK'; end if;
  if exists (select 1 from profiles where lower(nickname) = lower(n)) then raise exception 'NICK_TAKEN'; end if;
  insert into profiles (id, nickname) values (uid, n) returning * into pr;
  return pr;
end $$;

create or replace function set_nickname(p_nick text) returns profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pr profiles; n text := btrim(p_nick);
begin
  if n !~ '^[A-Za-zА-Яа-яЁё0-9_. -]{3,16}$' then raise exception 'BAD_NICK'; end if;
  if exists (select 1 from profiles where lower(nickname) = lower(n) and id <> uid) then raise exception 'NICK_TAKEN'; end if;
  update profiles set nickname = n where id = uid returning * into pr;
  return pr;
end $$;

create or replace function nick_free(p_nick text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(nickname) = lower(btrim(p_nick))) $$;

create or replace function claim_bonus() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lb timestamptz; bal numeric; n int; amt numeric;
begin
  select last_bonus, bonus_n + 1 into lb, n from profiles where id = uid for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  if lb is not null and lb > now() - interval '2 minutes' then
    raise exception 'COOLDOWN:%', ceil(extract(epoch from (lb + interval '2 minutes' - now())));
  end if;
  amt := case when n % 100 = 0 then 1000 when n % 10 = 0 then 100 else 15 end;  -- every 10th: $100, every 100th: $1000
  update profiles set balance = balance + amt, last_bonus = now(), bonus_n = n where id = uid returning balance into bal;
  return jsonb_build_object('balance', bal, 'last_bonus', now(), 'amount', amt, 'n', n);
end $$;

-- roll p_n drops for a player; with an active luck potion 40% of rolls get a second try and keep the pricier one
create or replace function do_open(p_uid uuid, p_nick text, p_case text, p_n int) returns jsonb language plpgsql as $$
declare d jsonb; d2 jsonb; iid bigint; res jsonb := '[]'; lucky boolean;
begin
  select coalesce(luck_until > now(), false) into lucky from profiles where id = p_uid;
  for i in 1..p_n loop
    d := roll_drop(p_case);
    if lucky and random() < .4 then
      d2 := roll_drop(p_case);
      if (d2->>'price')::numeric > (d->>'price')::numeric then d := d2 || '{"luck":true}'; end if;
    end if;
    iid := grant_item(p_uid, d, 'case');
    insert into drops (user_id, nickname, skin_id, float, st, price, source, case_id)
    values (p_uid, p_nick, (d->>'skin')::int, (d->>'float')::float8, (d->>'st')::boolean, (d->>'price')::numeric, 'case', p_case);
    res := res || jsonb_build_array(d || jsonb_build_object('id', iid));
  end loop;
  return res;
end $$;

create or replace function open_case(p_case text, p_n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c cases; cost numeric; nick text; bal numeric;
begin
  if p_n < 1 or p_n > 5 then raise exception 'BAD_N'; end if;
  select * into c from cases where id = p_case;
  if not found then raise exception 'NO_CASE'; end if;
  cost := round(c.price * p_n, 2);
  update profiles set balance = balance - cost, opened = opened + p_n, spent = spent + cost,
         xp = xp + floor(cost)::int + case when c.price >= 1 then 2 * p_n else 0 end
   where id = uid and balance >= cost returning nickname, balance into nick, bal;
  if not found then raise exception 'NO_FUNDS'; end if;
  return jsonb_build_object('items', do_open(uid, nick, p_case, p_n), 'balance', bal);
end $$;

-- open with free-opening tickets from the battle pass
create or replace function open_free(p_case text, p_n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nick text; bal numeric; k int;
begin
  if p_n < 1 or p_n > 5 then raise exception 'BAD_N'; end if;
  with del as (delete from perks where id in (select id from perks where owner = uid and kind = 'case' and case_id = p_case order by id limit p_n) returning 1)
  select count(*) into k from del;
  if k < p_n then raise exception 'NO_TICKETS'; end if;
  update profiles set opened = opened + p_n, xp = xp + 2 * p_n where id = uid returning nickname, balance into nick, bal;
  return jsonb_build_object('items', do_open(uid, nick, p_case, p_n), 'balance', bal);
end $$;

create or replace function sell_items(p_ids bigint[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s numeric; bal numeric;
begin
  with del as (delete from inventory where owner = uid and id = any(p_ids) returning price)
  select coalesce(sum(price), 0) into s from del;
  update profiles set balance = balance + s, sold = sold + s where id = uid returning balance into bal;
  return jsonb_build_object('sum', s, 'balance', bal);
end $$;

create or replace function upgrade_items(p_ids bigint[], p_skin int, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; total numeric; tgt numeric; ch float8; win boolean; s skins;
        lo float8; hi float8; f float8; d jsonb; iid bigint := null; nick text;
begin
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 6 then raise exception 'BAD_INPUT'; end if;
  select count(*), sum(price) into n, total from inventory where owner = uid and id = any(p_ids);
  if n <> array_length(p_ids, 1) then raise exception 'NOT_OWNER'; end if;
  select * into s from skins where id = p_skin;
  if not found or not (s.star or s.r in ('milspec','restricted','classified','covert','contraband')) or s.cat = 'equip' then raise exception 'BAD_TARGET'; end if;
  if s.mn is null then p_code := null;
  else
    select w.lo, w.hi into lo, hi from (values ('FN',0::float8,.07::float8),('MW',.07,.15),('FT',.15,.38),('WW',.38,.45),('BS',.45,1)) w(c,lo,hi) where w.c = p_code;
    if lo is null or not (s.mn < hi and s.mx > lo) then raise exception 'BAD_WEAR'; end if;
  end if;
  tgt := price_code(p_skin, p_code, false);
  if tgt <= total then raise exception 'TARGET_TOO_CHEAP'; end if;
  ch := least(.9, total / tgt * .92 * case when (select coalesce(luck_until > now(), false) from profiles where id = uid) then 1.1 else 1 end);
  update profiles set xp = xp + 5 where id = uid;
  delete from inventory where owner = uid and id = any(p_ids);
  win := random() < ch;
  if win then
    if p_code is not null then
      lo := greatest(lo, s.mn); hi := least(hi, s.mx);
      f := round((lo + (hi - lo) * random() * .999)::numeric, 9)::float8;
    end if;
    d := jsonb_build_object('skin', p_skin, 'float', f, 'st', false, 'price', price_of(p_skin, f, false), 'tier', s.tier);
    iid := grant_item(uid, d, 'upgrade');
    d := d || jsonb_build_object('id', iid);
    update profiles set up_w = up_w + 1 where id = uid returning nickname into nick;
    insert into drops (user_id, nickname, skin_id, float, st, price, source, extra)
    values (uid, nick, p_skin, f, false, (d->>'price')::numeric, 'upgrade', round(ch * 100, 2)::text);
  else
    update profiles set up_l = up_l + 1 where id = uid;
  end if;
  return jsonb_build_object('win', win, 'chance', ch, 'item', d, 'balance', (select balance from profiles where id = uid));
end $$;

create or replace function gift_item(p_id bigint, p_to text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); to_id uuid; to_nick text; it inventory; nick text;
begin
  select id, nickname into to_id, to_nick from profiles where lower(nickname) = lower(btrim(p_to));
  if to_id is null then raise exception 'NO_USER'; end if;
  if to_id = uid then raise exception 'SELF'; end if;
  update inventory set owner = to_id, src = 'gift' where id = p_id and owner = uid returning * into it;
  if not found then raise exception 'NOT_OWNER'; end if;
  nick := me_nick();
  insert into drops (user_id, nickname, skin_id, float, st, price, source, extra)
  values (uid, nick, it.skin_id, it.float, it.st, it.price, 'gift', to_nick);
  return jsonb_build_object('to', to_nick);
end $$;

-- ---------- battles ----------
create or replace function create_battle(p_case text, p_rounds int, p_players int) returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c cases; cost numeric; nick text; bid bigint;
begin
  if p_rounds not between 1 and 5 or p_players not between 2 and 4 then raise exception 'BAD_INPUT'; end if;
  select * into c from cases where id = p_case;
  if not found then raise exception 'NO_CASE'; end if;
  cost := round(c.price * p_rounds, 2);
  update profiles set balance = balance - cost, opened = opened + p_rounds, spent = spent + cost, xp = xp + floor(cost)::int + 2 * p_rounds
   where id = uid and balance >= cost returning nickname into nick;
  if not found then raise exception 'NO_FUNDS'; end if;
  insert into battles (case_id, rounds, max_players, cost, creator, creator_nick) values (p_case, p_rounds, p_players, cost, uid, nick) returning id into bid;
  insert into battle_players (battle_id, user_id, nickname, slot) values (bid, uid, nick, 0);
  return bid;
end $$;

create or replace function resolve_battle(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare b battles; p record; d jsonb; best numeric := -1; wslot int; wuser uuid; wnick text; ties int := 0; tot numeric; top jsonb; topp numeric := -1;
begin
  select * into b from battles where id = p_id for update;
  for r in 1..b.rounds loop
    for p in select * from battle_players where battle_id = p_id order by slot loop
      d := roll_drop(b.case_id);
      insert into battle_drops (battle_id, slot, round, skin_id, float, st, price, tier)
      values (p_id, p.slot, r, (d->>'skin')::int, (d->>'float')::float8, (d->>'st')::boolean, (d->>'price')::numeric, d->>'tier');
    end loop;
  end loop;
  update battle_players bp set total = (select coalesce(sum(price), 0) from battle_drops where battle_id = p_id and slot = bp.slot) where battle_id = p_id;
  -- winner: highest total, random among ties
  for p in select * from battle_players where battle_id = p_id order by total desc, random() limit 1 loop
    wslot := p.slot; wuser := p.user_id; wnick := p.nickname;
  end loop;
  select sum(price) into tot from battle_drops where battle_id = p_id;
  if wuser is not null then
    for d in select jsonb_build_object('skin', skin_id, 'float', float, 'st', st, 'price', price) from battle_drops where battle_id = p_id loop
      perform grant_item(wuser, d, 'battle');
      if (d->>'price')::numeric > topp then topp := (d->>'price')::numeric; top := d; end if;
    end loop;
    update profiles set battles_w = battles_w + 1 where id = wuser;
    insert into drops (user_id, nickname, skin_id, float, st, price, source, case_id, extra)
    values (wuser, wnick, (top->>'skin')::int, (top->>'float')::float8, (top->>'st')::boolean, tot, 'battle', b.case_id, p_id::text);
  end if;
  update profiles set battles_l = battles_l + 1 where id in (select user_id from battle_players where battle_id = p_id and user_id is not null and slot <> wslot);
  update battles set status = 'done', winner_slot = wslot, total = tot, finished_at = now() where id = p_id;
end $$;

create or replace function join_battle(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b battles; nick text; cnt int;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' then raise exception 'NOT_OPEN'; end if;
  if exists (select 1 from battle_players where battle_id = p_id and user_id = uid) then raise exception 'ALREADY_IN'; end if;
  select count(*) into cnt from battle_players where battle_id = p_id;
  if cnt >= b.max_players then raise exception 'FULL'; end if;
  update profiles set balance = balance - b.cost, opened = opened + b.rounds, spent = spent + b.cost, xp = xp + floor(b.cost)::int + 2 * b.rounds
   where id = uid and balance >= b.cost returning nickname into nick;
  if not found then raise exception 'NO_FUNDS'; end if;
  insert into battle_players (battle_id, user_id, nickname, slot)
  values (p_id, uid, nick, (select min(s) from generate_series(0, b.max_players - 1) s where s not in (select slot from battle_players where battle_id = p_id)));
  if cnt + 1 = b.max_players then perform resolve_battle(p_id); end if;
end $$;

create or replace function add_bot(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b battles; cnt int;
  names text[] := array['Бот Вася','Бот Глеб','Бот Олег','Бот Жора','Бот Стёпа','Бот Кеша','Бот Валера','Бот Толик'];
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' then raise exception 'NOT_OPEN'; end if;
  if b.creator <> uid then raise exception 'NOT_CREATOR'; end if;
  select count(*) into cnt from battle_players where battle_id = p_id;
  if cnt >= b.max_players then raise exception 'FULL'; end if;
  insert into battle_players (battle_id, user_id, nickname, slot, is_bot)
  values (p_id, null, names[1 + floor(random() * array_length(names, 1))::int], (select min(s) from generate_series(0, b.max_players - 1) s where s not in (select slot from battle_players where battle_id = p_id)), true);
  if cnt + 1 = b.max_players then perform resolve_battle(p_id); end if;
end $$;

create or replace function cancel_battle(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b battles;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status <> 'open' then raise exception 'NOT_OPEN'; end if;
  if b.creator <> uid then raise exception 'NOT_CREATOR'; end if;
  update profiles set balance = balance + b.cost, opened = opened - b.rounds, spent = spent - b.cost
   where id in (select user_id from battle_players where battle_id = p_id and user_id is not null);
  update battles set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

-- ============ quests, levels, daily bonus, pumpkins ============
-- quest tiers: reach the target (lifetime counter) -> claim money + xp -> next tier
create or replace function quest_def(p_type text, p_tier int, out target numeric, out money numeric, out xp int) language plpgsql immutable as $$
declare t numeric[]; m numeric[]; x int[]; n int;
begin
  case p_type
    when 'open'     then t := '{5,25,75,200,500,1000,2500}'; m := '{10,30,75,150,300,500,1000}'; x := '{50,100,200,350,500,750,1000}';
    when 'battles'  then t := '{1,5,15,40,100,250}';         m := '{15,60,150,350,800,1500}';      x := '{60,150,300,500,800,1200}';
    when 'upgrades' then t := '{1,5,15,40,100,250}';         m := '{10,50,120,300,700,1500}';      x := '{50,120,250,450,700,1100}';
    when 'spent'    then t := '{50,250,1000,5000,20000,100000}'; m := '{5,25,100,400,1500,6000}';  x := '{40,100,250,500,900,1500}';
    else raise exception 'BAD_QUEST';
  end case;
  n := array_length(t, 1);
  if p_tier < n then target := t[p_tier + 1]; money := m[p_tier + 1]; xp := x[p_tier + 1];
  else target := t[n] * power(2, p_tier - n + 1); money := m[n]; xp := x[n]; end if;
end $$;

create or replace function claim_quest(p_type text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p profiles; tier int; d record; cur numeric; bal numeric;
begin
  select * into p from profiles where id = v_uid for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  tier := coalesce((p.quests ->> p_type)::int, 0);
  select * into d from quest_def(p_type, tier);
  cur := case p_type when 'open' then p.opened when 'battles' then p.battles_w when 'upgrades' then p.up_w when 'spent' then p.spent end;
  if cur < d.target then raise exception 'QUEST_NOT_DONE'; end if;
  update profiles set balance = balance + d.money, xp = xp + d.xp, quests = jsonb_set(quests, array[p_type], to_jsonb(tier + 1))
   where id = v_uid returning balance into bal;
  return jsonb_build_object('balance', bal, 'money', d.money, 'xp', d.xp, 'tier', tier + 1);
end $$;

-- daily bonus: $50, from day 8 of the streak $70, from day 31 $200, +$25 for every further month
create or replace function daily_amount(p_streak int) returns numeric language sql immutable as $$
  select (case when p_streak >= 31 then 200 + 25 * ((p_streak - 31) / 30) when p_streak >= 8 then 70 else 50 end)::numeric $$;

create or replace function claim_daily() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p profiles; st int; amt numeric; bal numeric; today date := current_date;
begin
  select * into p from profiles where id = v_uid for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  if p.daily_last = today then raise exception 'DAILY_DONE:%', ceil(extract(epoch from ((today + 1)::timestamptz - now()))); end if;
  st := case when p.daily_last = today - 1 then p.daily_streak + 1 else 1 end;
  amt := daily_amount(st);
  update profiles set balance = balance + amt, xp = xp + 25, daily_last = today, daily_streak = st where id = v_uid returning balance into bal;
  return jsonb_build_object('balance', bal, 'amount', amt, 'streak', st, 'xp', 25, 'day', today);
end $$;

create or replace function my_pumpkins() returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pid order by pid), '{}') from pumpkins where owner = auth.uid() $$;

create or replace function find_pumpkin(p_id int) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p profiles; n int; reward numeric := 0; bal numeric;
begin
  if p_id < 1 or p_id > 20 then raise exception 'BAD_PUMPKIN'; end if;
  select * into p from profiles where id = v_uid for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  insert into pumpkins (owner, pid) values (v_uid, p_id) on conflict do nothing;
  select count(*) into n from pumpkins where owner = v_uid;
  bal := p.balance;
  if n >= 20 and not p.pumpkin_done then
    reward := 1000;
    update profiles set balance = balance + 1000, xp = xp + 500, pumpkin_done = true where id = v_uid returning balance into bal;
  end if;
  return jsonb_build_object('found', n, 'reward', reward, 'balance', bal, 'list', my_pumpkins());
end $$;

-- ============ battle pass ============
create or replace function level_of(p_xp int) returns int language plpgsql immutable as $$
declare l int := 1;
begin
  while 50 * (l + 1) * l <= p_xp loop l := l + 1; end loop;
  return l;
end $$;

-- levels 2..50 come from bp_rewards (seed); after 50: every 10th a Budget Blades opening, every 5th a 30-min luck potion, else $100
create or replace function bp_reward(p_level int) returns bp_rewards language plpgsql stable as $$
declare r bp_rewards;
begin
  select * into r from bp_rewards where level = p_level;
  if found then return r; end if;
  r.level := p_level;
  if p_level % 10 = 0 then r.kind := 'case'; r.case_id := 'c-knife-budget'; r.n := 1;
  elsif p_level % 5 = 0 then r.kind := 'luck'; r.mins := 30;
  else r.kind := 'money'; r.amount := 100; end if;
  return r;
end $$;

create or replace function roll_code_float(p_skin int, p_code text) returns float8 language plpgsql volatile as $$
declare s skins; lo float8; hi float8;
begin
  select * into s from skins where id = p_skin;
  if s.mn is null or p_code is null then return null; end if;
  select w.lo, w.hi into lo, hi from (values ('FN',0::float8,.07::float8),('MW',.07,.15),('FT',.15,.38),('WW',.38,.45),('BS',.45,1)) w(c,lo,hi) where w.c = p_code;
  lo := greatest(lo, s.mn); hi := least(hi, s.mx);
  return round((lo + (hi - lo) * random() * .999)::numeric, 9)::float8;
end $$;

create or replace function claim_level(p_level int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles; r bp_rewards; bal numeric; d jsonb := null; iid bigint; f float8;
begin
  select * into p from profiles where id = uid for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  if p_level < 2 or level_of(p.xp) < p_level then raise exception 'LEVEL_LOCKED'; end if;
  if p_level = any(p.bp_claimed) then raise exception 'ALREADY_CLAIMED'; end if;
  r := bp_reward(p_level);
  update profiles set bp_claimed = bp_claimed || p_level where id = uid;
  if r.kind = 'money' then
    update profiles set balance = balance + r.amount where id = uid;
  elsif r.kind = 'luck' then
    insert into perks (owner, kind, mins) values (uid, 'luck', r.mins);
  elsif r.kind = 'case' then
    insert into perks (owner, kind, case_id) select uid, 'case', r.case_id from generate_series(1, r.n);
  elsif r.kind = 'skin' then
    f := roll_code_float(r.skin_id, r.code);
    d := jsonb_build_object('skin', r.skin_id, 'float', f, 'st', false, 'price', price_of(r.skin_id, f, false));
    iid := grant_item(uid, d, 'pass');
    d := d || jsonb_build_object('id', iid);
    insert into drops (user_id, nickname, skin_id, float, st, price, source, extra)
    values (uid, p.nickname, r.skin_id, f, false, (d->>'price')::numeric, 'pass', p_level::text);
  end if;
  select balance into bal from profiles where id = uid;
  return jsonb_build_object('balance', bal, 'kind', r.kind, 'item', d, 'level', p_level);
end $$;

create or replace function use_luck(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m int; u timestamptz;
begin
  delete from perks where id = p_id and owner = uid and kind = 'luck' returning mins into m;
  if m is null then raise exception 'NO_PERK'; end if;
  update profiles set luck_until = greatest(coalesce(luck_until, now()), now()) + make_interval(mins => m) where id = uid returning luck_until into u;
  return jsonb_build_object('luck_until', u);
end $$;

-- ============ "steam": withdrawn skins (virtual, they leave the inventory for good) ============
create or replace function withdraw_items(p_ids bigint[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; v numeric;
begin
  with del as (delete from inventory where owner = uid and id = any(p_ids) returning *),
       ins as (insert into steam_items (owner, skin_id, float, st, price, src, got_at)
               select owner, skin_id, float, st, price, src, created_at from del returning price)
  select count(*), coalesce(sum(price), 0) into n, v from ins;
  if n = 0 then raise exception 'NOT_OWNER'; end if;
  return jsonb_build_object('n', n, 'sum', v);
end $$;

-- ============ climb: the operator runs up the stairs and trips at a random multiplier ============
-- P(reaching x) = 0.96 / x; the crash point is decided here, before the client animates anything
create or replace function play_climb(p_ids bigint[], p_amount numeric, p_target numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nick text; bet numeric; k int := 0; crash numeric; win boolean; pay numeric := 0; bal numeric;
begin
  if p_target is null or p_target < 1.01 or p_target > 1000 then raise exception 'BAD_TARGET'; end if;
  p_target := round(p_target, 2);
  if coalesce(array_length(p_ids, 1), 0) > 0 then
    if array_length(p_ids, 1) > 20 then raise exception 'BAD_INPUT'; end if;
    with del as (delete from inventory where owner = uid and id = any(p_ids) returning price)
    select count(*), coalesce(sum(price), 0) into k, bet from del;
    if k <> array_length(p_ids, 1) then raise exception 'NOT_OWNER'; end if;
  else
    bet := round(coalesce(p_amount, 0), 2);
    if bet < 0.1 then raise exception 'BAD_BET'; end if;
    update profiles set balance = balance - bet where id = uid and balance >= bet;
    if not found then raise exception 'NO_FUNDS'; end if;
  end if;
  crash := least(1000, greatest(1, floor(96 / (1 - random())) / 100));
  win := crash >= p_target;
  if win then pay := round(bet * p_target, 2); end if;
  update profiles set balance = balance + pay, xp = xp + 2 + least(floor(bet / 4), 500)::int
   where id = uid returning nickname, balance into nick, bal;
  insert into climbs (user_id, nickname, bet, skins, target, crash, win, payout) values (uid, nick, bet, k, p_target, crash, win, pay);
  return jsonb_build_object('crash', crash, 'win', win, 'payout', pay, 'bet', bet, 'balance', bal, 'target', p_target);
end $$;

-- ============ traffic ============
create or replace function site_stats() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'day', (select count(*) from visits where day = current_date),
    'month', (select count(distinct uid) from visits where day >= date_trunc('month', current_date)::date),
    'players', (select count(*) from profiles)) $$;
create or replace function track_visit() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into visits (day, uid) values (current_date, auth.uid()) on conflict (day, uid) do update set hits = visits.hits + 1;
  end if;
  return site_stats();
end $$;

-- ============ permissions ============
do $$ declare f text; begin
  -- internal helpers: not callable from the API
  foreach f in array array['roll_float(int)','roll_drop(text)','grant_item(uuid,jsonb,text)','resolve_battle(bigint)','do_open(uuid,text,text,int)','roll_code_float(int,text)','bp_reward(int)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- player API: signed-in users only (guests are signed in anonymously)
  foreach f in array array['ensure_profile(text)','set_nickname(text)','claim_bonus()','open_case(text,int)','sell_items(bigint[])',
                           'upgrade_items(bigint[],int,text)','gift_item(bigint,text)','create_battle(text,int,int)','join_battle(bigint)',
                           'add_bot(bigint)','cancel_battle(bigint)','track_visit()','claim_quest(text)','claim_daily()',
                           'find_pumpkin(int)','my_pumpkins()','claim_level(int)','use_luck(bigint)','open_free(text,int)',
                           'withdraw_items(bigint[])','play_climb(bigint[],numeric,numeric)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function nick_free(text) to anon, authenticated;
revoke all on function site_stats() from public;
grant execute on function site_stats() to anon, authenticated;
-- read-only access for the site (writes happen only inside the functions above)
grant usage on schema public to anon, authenticated;
grant select on skins, cases, case_items, profiles, inventory, drops, battles, battle_players, battle_drops, leaderboard, bp_rewards, perks, steam_items, climbs to anon, authenticated;
