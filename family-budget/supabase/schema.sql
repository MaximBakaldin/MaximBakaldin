-- Fresh database only. For an existing database apply the missing upgrades separately.

create table public.households(id uuid primary key default gen_random_uuid(),name text not null,invite_code text unique not null default upper(replace(gen_random_uuid()::text,'-','')),created_by uuid not null references auth.users(id));
create table public.members(household_id uuid references public.households(id) on delete cascade,user_id uuid references auth.users(id),primary key(household_id,user_id));
create table public.categories(id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,name text not null,kind text not null check(kind in ('expense','income')),essential boolean not null default false,unique(id,household_id,kind));
create table public.transactions(id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,user_id uuid not null references auth.users(id),category_id uuid not null,kind text not null check(kind in ('expense','income')),amount numeric(14,2) not null check(amount>0),occurred_on date not null,comment text,created_at timestamptz not null default now(),foreign key(category_id,household_id,kind) references public.categories(id,household_id,kind));
create table public.budgets(household_id uuid references public.households(id) on delete cascade,category_id uuid references public.categories(id),month date not null check(extract(day from month)=1),amount numeric(14,2) not null check(amount>=0),primary key(household_id,category_id,month));
create index on public.transactions(household_id,occurred_on desc);
create or replace function public.is_member(h uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where household_id=h and user_id=auth.uid()) $$;
create or replace function public.create_family(n text) returns uuid language plpgsql security definer set search_path='' as $$ declare h uuid; begin if auth.uid() is null then raise exception 'Login required'; end if; insert into public.households(name,created_by) values(coalesce(nullif(trim(n),''),'Наша семья'),auth.uid()) returning id into h; insert into public.members values(h,auth.uid()); insert into public.categories(household_id,name,kind,essential) values(h,'Продукты','expense',true),(h,'Дети','expense',true),(h,'Дом и ЖКХ','expense',true),(h,'Транспорт','expense',true),(h,'Здоровье','expense',true),(h,'Досуг','expense',false),(h,'Прочее','expense',false),(h,'Зарплата','income',false),(h,'Другие доходы','income',false); return h; end $$;
create or replace function public.join_family(code text) returns uuid language plpgsql security definer set search_path='' as $$ declare h uuid; begin if auth.uid() is null then raise exception 'Login required'; end if; select id into h from public.households where invite_code=upper(trim(code)); if h is null then raise exception 'Неверный код'; end if; insert into public.members values(h,auth.uid()) on conflict do nothing; return h; end $$;
revoke all on function public.create_family(text),public.join_family(text) from public;
grant execute on function public.create_family(text),public.join_family(text) to authenticated;
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
create policy h_read on public.households for select to authenticated using(public.is_member(id));
create policy m_read on public.members for select to authenticated using(public.is_member(household_id));
create policy c_read on public.categories for select to authenticated using(public.is_member(household_id));
create policy t_read on public.transactions for select to authenticated using(public.is_member(household_id));
create policy t_insert on public.transactions for insert to authenticated with check(public.is_member(household_id) and user_id=auth.uid());
create policy t_update on public.transactions for update to authenticated using(public.is_member(household_id)) with check(public.is_member(household_id) and user_id=auth.uid());
create policy t_delete on public.transactions for delete to authenticated using(public.is_member(household_id));
create policy b_read on public.budgets for select to authenticated using(public.is_member(household_id));
create policy b_insert on public.budgets for insert to authenticated with check(public.is_member(household_id) and exists(select 1 from public.categories c where c.id=category_id and c.household_id=budgets.household_id and c.kind='expense'));
create policy b_update on public.budgets for update to authenticated using(public.is_member(household_id)) with check(public.is_member(household_id) and exists(select 1 from public.categories c where c.id=category_id and c.household_id=budgets.household_id and c.kind='expense'));

begin;

-- Fail explicitly instead of silently deleting existing memberships.
do $$ begin
  if exists(select 1 from public.members group by user_id having count(*) > 1) then
    raise exception 'У пользователя несколько семей. Выберите одну перед применением миграции';
  end if;
end $$;
alter table public.members add constraint one_household_per_user unique(user_id);
alter table public.members add column display_name text not null default 'Участник' check(length(display_name) between 1 and 60);
update public.members m set display_name='Владелец' from public.households h where h.id=m.household_id and h.created_by=m.user_id;
alter table public.households add column revision bigint not null default 0;
alter table public.transactions add column updated_at timestamptz not null default now();
alter table public.transactions add column updated_by uuid references auth.users(id);
update public.transactions set updated_by=user_id;
alter table public.transactions alter column updated_by set not null;
alter table public.transactions add column version integer not null default 1;
alter table public.budgets add column version integer not null default 1;
alter table public.transactions add constraint comment_length check(length(comment) <= 2000);
create index transactions_page on public.transactions(household_id, occurred_on desc, id desc);
create index budgets_month on public.budgets(household_id, month);

create table public.family_invites (
  household_id uuid primary key references public.households(id) on delete cascade,
  code text unique not null,
  expires_at timestamptz not null
);
alter table public.family_invites enable row level security;
-- Old permanent codes stop working. A new invite is issued by the owner.
alter table public.households drop column invite_code;

-- All writes go through RPCs, so a raw table update cannot bypass version checks.
revoke insert, update, delete on public.households, public.members, public.categories, public.transactions, public.budgets from authenticated, anon;
revoke all on public.family_invites from authenticated, anon;
grant select on public.households, public.members, public.categories, public.transactions, public.budgets to authenticated;

create or replace function public.create_family(n text) returns uuid
language plpgsql security definer set search_path='' as $$
declare h uuid; u uuid := auth.uid(); begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select household_id into h from public.members where user_id=u;
  if h is not null then return h; end if;
  if length(trim(n)) not between 1 and 80 or n is null then raise exception 'Название семьи: от 1 до 80 символов'; end if;
  insert into public.households(name,created_by) values(trim(n),u) returning id into h;
  insert into public.members(household_id,user_id,display_name) values(h,u,'Владелец');
  insert into public.categories(household_id,name,kind,essential) values
  (h,'Продукты','expense',true),(h,'Дети','expense',true),(h,'Дом и ЖКХ','expense',true),
  (h,'Транспорт','expense',true),(h,'Здоровье','expense',true),(h,'Досуг','expense',false),
  (h,'Прочее','expense',false),(h,'Зарплата','income',false),(h,'Другие доходы','income',false);
  return h;
end $$;

create or replace function public.join_family(code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare h uuid; existing uuid; u uuid := auth.uid(); begin
  if u is null then raise exception 'Войдите в аккаунт'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select household_id into existing from public.members where user_id=u;
  if existing is not null then return existing; end if;
  select household_id into h from public.family_invites i where i.code=upper(trim(join_family.code)) and expires_at>now() for update;
  if h is null then raise exception 'Код недействителен или срок приглашения истёк'; end if;
  insert into public.members(household_id,user_id) values(h,u);
  delete from public.family_invites where household_id=h;
  return h;
end $$;

create function public.rotate_invite(p_household uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text := upper(replace(gen_random_uuid()::text,'-','')); expiry timestamptz := now()+interval '7 days'; begin
  if not exists(select 1 from public.households where id=p_household and created_by=auth.uid()) then raise exception 'Только владелец может приглашать участников'; end if;
  insert into public.family_invites values(p_household,token,expiry)
  on conflict(household_id) do update set code=excluded.code,expires_at=excluded.expires_at;
  return jsonb_build_object('code',token,'expires_at',expiry);
end $$;
create function public.revoke_invite(p_household uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not exists(select 1 from public.households where id=p_household and created_by=auth.uid()) then raise exception 'Доступ запрещён'; end if;
  delete from public.family_invites where household_id=p_household;
end $$;
create function public.remove_member(p_household uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid()=p_user or not exists(select 1 from public.households where id=p_household and created_by=auth.uid()) then raise exception 'Владелец может исключить другого участника'; end if;
  delete from public.members where household_id=p_household and user_id=p_user;
  delete from public.family_invites where household_id=p_household;
end $$;
create function public.set_member_name(p_name text) returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or length(trim(p_name)) not between 1 and 60 or p_name is null then raise exception 'Имя: от 1 до 60 символов'; end if;
  update public.members set display_name=trim(p_name) where user_id=auth.uid();
end $$;

create function public.bump_family_revision() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if TG_OP='DELETE' then
    update public.households set revision=revision+1 where id=old.household_id;
    return old;
  end if;
  update public.households set revision=revision+1 where id=new.household_id;
  return new;
end $$;
create trigger transaction_revision after insert or update or delete on public.transactions for each row execute function public.bump_family_revision();
create trigger budget_revision after insert or update or delete on public.budgets for each row execute function public.bump_family_revision();

create function public.save_transaction(p_household uuid,p_id uuid,p_version integer,p_category uuid,p_kind text,p_amount numeric,p_date date,p_comment text) returns public.transactions
language plpgsql security definer set search_path='' as $$
declare t public.transactions; begin
  if not public.is_member(p_household) then raise exception 'Доступ к семье закрыт'; end if;
  if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Некорректная сумма'; end if;
  if p_date is null or p_date<'1900-01-01' or p_date>'9998-12-31' then raise exception 'Некорректная дата'; end if;
  if p_version is null or p_version<0 then raise exception 'Некорректная версия'; end if;
  if p_kind is null or p_kind not in ('income','expense') or not exists(select 1 from public.categories where id=p_category and household_id=p_household and kind=p_kind) then raise exception 'Некорректная категория'; end if;
  if length(p_comment)>2000 then raise exception 'Комментарий слишком длинный'; end if;
  -- Serializes retries of the same operation, including the initial insert.
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select * into t from public.transactions where id=p_id for update;
  if found then
    if t.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
    if p_version=0 and t.user_id=auth.uid() and t.category_id=p_category and t.kind=p_kind and t.amount=p_amount and t.occurred_on=p_date and t.comment is not distinct from nullif(trim(p_comment),'') then return t; end if;
    if p_version=0 or t.version<>p_version then raise exception 'Операция уже изменена. Обновите данные и откройте её заново'; end if;
    update public.transactions set category_id=p_category,kind=p_kind,amount=p_amount,occurred_on=p_date,comment=nullif(trim(p_comment),''),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into t;
  else
    if p_version<>0 then raise exception 'Операция уже удалена'; end if;
    insert into public.transactions(id,household_id,user_id,category_id,kind,amount,occurred_on,comment,updated_by)
    values(p_id,p_household,auth.uid(),p_category,p_kind,p_amount,p_date,nullif(trim(p_comment),''),auth.uid()) returning * into t;
  end if;
  return t;
end $$;

create function public.delete_transaction(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare t public.transactions; begin
  select * into t from public.transactions where id=p_id for update;
  if not found then return; end if;
  if not public.is_member(t.household_id) then raise exception 'Доступ запрещён'; end if;
  if p_version is null or t.version<>p_version then raise exception 'Операция уже изменена. Обновите данные перед удалением'; end if;
  delete from public.transactions where id=p_id;
end $$;

create function public.save_budget(p_household uuid,p_category uuid,p_month date,p_amount numeric,p_version integer) returns public.budgets
language plpgsql security definer set search_path='' as $$
declare b public.budgets; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  if p_amount is null or p_amount<0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Некорректная сумма'; end if;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
  if p_version is null or p_version<0 then raise exception 'Некорректная версия'; end if;
  if not exists(select 1 from public.categories where id=p_category and household_id=p_household and kind='expense') then raise exception 'Некорректная категория'; end if;
  perform pg_advisory_xact_lock(hashtext(p_household::text||p_category::text||p_month::text));
  select * into b from public.budgets where household_id=p_household and category_id=p_category and month=p_month for update;
  if found then
    if b.version<>p_version then raise exception 'План уже изменён. Обновите данные перед сохранением'; end if;
    update public.budgets set amount=p_amount,version=version+1 where household_id=p_household and category_id=p_category and month=p_month returning * into b;
  else
    if p_version<>0 then raise exception 'План уже изменён'; end if;
    insert into public.budgets(household_id,category_id,month,amount) values(p_household,p_category,p_month,p_amount) returning * into b;
  end if;
  return b;
end $$;

create function public.copy_budget(p_household uuid,p_month date) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
  insert into public.budgets(household_id,category_id,month,amount)
  select household_id,category_id,p_month,amount from public.budgets where household_id=p_household and month=(p_month-interval '1 month')::date
  on conflict(household_id,category_id,month) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;

-- One statement snapshot: totals and revision come from the same database snapshot.
create function public.budget_snapshot(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'family',jsonb_build_object('id',h.id,'name',h.name,'created_by',h.created_by),
    'revision',h.revision,
    'categories',coalesce((select jsonb_agg(c order by c.kind,c.name) from public.categories c where c.household_id=h.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(m order by m.user_id) from public.members m where m.household_id=h.id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(b) from public.budgets b where b.household_id=h.id and b.month=p_month),'[]'::jsonb),
    'summary',coalesce((select jsonb_agg(s) from (select t.category_id,t.kind,((sum(t.amount)*100)::numeric(30,0))::text as cents from public.transactions t where t.household_id=h.id and t.occurred_on>=p_month and t.occurred_on<(p_month+interval '1 month') group by t.category_id,t.kind) s),'[]'::jsonb)
  ) from public.households h join public.members me on me.household_id=h.id and me.user_id=auth.uid();
$$;

-- Functions are not executable by anonymous users or PUBLIC by default.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_member','create_family','join_family','rotate_invite','revoke_invite','remove_member','set_member_name','save_transaction','delete_transaction','save_budget','copy_budget','budget_snapshot','bump_family_revision') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    if f.signature::text not like '%bump_family_revision%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
end $$;

-- Polling remains available when Realtime is not configured in the project.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='households') then
      alter publication supabase_realtime add table public.households;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='members') then
      alter publication supabase_realtime add table public.members;
    end if;
  end if;
end $$;
commit;

-- Public clients may only read rows permitted by RLS; RPCs handle all writes.
revoke all on table public.households, public.members, public.categories, public.transactions, public.budgets, public.family_invites from public, anon, authenticated;
grant select on table public.households, public.members, public.categories, public.transactions, public.budgets to authenticated;
