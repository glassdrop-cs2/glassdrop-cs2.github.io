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
  foreach t in array array['skins','cases','case_items','profiles','inventory','drops','battles','battle_players','battle_drops'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all on %I', t);
    execute format('create policy read_all on %I for select using (true)', t);
  end loop;
end $$;

create or replace view leaderboard with (security_invoker = on) as
select p.id, p.nickname, p.balance, coalesce(i.v, 0)::numeric(14,2) as inv_value, (p.balance + coalesce(i.v, 0))::numeric(14,2) as networth,
       p.best_price, p.best_skin, p.best_float, p.best_st, p.opened, p.up_w, p.up_l, p.battles_w, p.battles_l
from profiles p left join (select owner, sum(price) v from inventory group by owner) i on i.owner = p.id;

-- realtime
do $$ declare t text; begin
  foreach t in array array['drops','battles','battle_players','inventory','profiles'] loop
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

create or replace function open_case(p_case text, p_n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c cases; cost numeric; nick text; bal numeric; d jsonb; iid bigint; res jsonb := '[]';
begin
  if p_n < 1 or p_n > 5 then raise exception 'BAD_N'; end if;
  select * into c from cases where id = p_case;
  if not found then raise exception 'NO_CASE'; end if;
  cost := round(c.price * p_n, 2);
  update profiles set balance = balance - cost, opened = opened + p_n, spent = spent + cost
   where id = uid and balance >= cost returning nickname, balance into nick, bal;
  if not found then raise exception 'NO_FUNDS'; end if;
  for i in 1..p_n loop
    d := roll_drop(p_case);
    iid := grant_item(uid, d, 'case');
    insert into drops (user_id, nickname, skin_id, float, st, price, source, case_id)
    values (uid, nick, (d->>'skin')::int, (d->>'float')::float8, (d->>'st')::boolean, (d->>'price')::numeric, 'case', p_case);
    res := res || jsonb_build_array(d || jsonb_build_object('id', iid));
  end loop;
  return jsonb_build_object('items', res, 'balance', bal);
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
  ch := least(.9, total / tgt * .92);
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
  update profiles set balance = balance - cost, opened = opened + p_rounds, spent = spent + cost
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
  update profiles set balance = balance - b.cost, opened = opened + b.rounds, spent = spent + b.cost
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
  foreach f in array array['roll_float(int)','roll_drop(text)','grant_item(uuid,jsonb,text)','resolve_battle(bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- player API: signed-in users only (guests are signed in anonymously)
  foreach f in array array['ensure_profile(text)','set_nickname(text)','claim_bonus()','open_case(text,int)','sell_items(bigint[])',
                           'upgrade_items(bigint[],int,text)','gift_item(bigint,text)','create_battle(text,int,int)','join_battle(bigint)',
                           'add_bot(bigint)','cancel_battle(bigint)','track_visit()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function nick_free(text) to anon, authenticated;
revoke all on function site_stats() from public;
grant execute on function site_stats() to anon, authenticated;
-- read-only access for the site (writes happen only inside the functions above)
grant usage on schema public to anon, authenticated;
grant select on skins, cases, case_items, profiles, inventory, drops, battles, battle_players, battle_drops, leaderboard to anon, authenticated;
