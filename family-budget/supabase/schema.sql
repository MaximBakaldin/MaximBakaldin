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

begin;
alter table public.households add column settings_version integer not null default 1;
alter table public.categories add column archived boolean not null default false;
alter table public.categories add column version integer not null default 1;
create trigger category_revision after insert or update or delete on public.categories for each row execute function public.bump_family_revision();

create table public.recurring_rules (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 version integer not null default 1, unique(id,household_id)
);
create table public.recurring_terms (
 rule_id uuid not null, household_id uuid not null, effective_month date not null check(extract(day from effective_month)=1),
 name text not null check(length(trim(name)) between 1 and 80), category_id uuid not null references public.categories(id),
 amount numeric(14,2) not null check(amount>0), due_day integer not null check(due_day between 1 and 31), active boolean not null default true,
 primary key(rule_id,effective_month), foreign key(rule_id,household_id) references public.recurring_rules(id,household_id) on delete cascade
);
alter table public.transactions add column recurring_id uuid;
alter table public.transactions add column recurring_month date;
alter table public.transactions add constraint recurring_family foreign key(recurring_id,household_id) references public.recurring_rules(id,household_id);
alter table public.transactions add constraint recurring_month_valid check((recurring_id is null and recurring_month is null) or (recurring_id is not null and recurring_month is not null and kind='expense' and extract(day from recurring_month)=1 and occurred_on>=recurring_month and occurred_on<(recurring_month+interval '1 month')));
create unique index one_recurring_payment_per_month on public.transactions(recurring_id,recurring_month) where recurring_id is not null;
create index recurring_terms_family on public.recurring_terms(household_id,effective_month);
create index recurring_rules_family on public.recurring_rules(household_id);
create index recurring_terms_category on public.recurring_terms(category_id);
create trigger recurring_revision after insert or update or delete on public.recurring_terms for each row execute function public.bump_family_revision();

create table public.savings_entries (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 kind text not null check(kind in ('opening','deposit','withdrawal')), amount numeric(14,2) not null check(amount>0),
 occurred_on date not null, comment text check(length(comment)<=2000), user_id uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id), version integer not null default 1, created_at timestamptz not null default now()
);
create unique index savings_one_opening on public.savings_entries(household_id) where kind='opening';
create index savings_family_date on public.savings_entries(household_id,occurred_on);
create trigger savings_revision after insert or update or delete on public.savings_entries for each row execute function public.bump_family_revision();

alter table public.recurring_rules enable row level security;
alter table public.recurring_terms enable row level security;
alter table public.savings_entries enable row level security;
create policy recurring_rules_read on public.recurring_rules for select to authenticated using(public.is_member(household_id));
create policy recurring_terms_read on public.recurring_terms for select to authenticated using(public.is_member(household_id));
create policy savings_read on public.savings_entries for select to authenticated using(public.is_member(household_id));
revoke all on public.recurring_rules,public.recurring_terms,public.savings_entries from public,anon,authenticated;
grant select on public.recurring_rules,public.recurring_terms,public.savings_entries to authenticated;

create function public.rename_family(p_household uuid,p_name text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.households where id=p_household and created_by=auth.uid()) then raise exception 'Только владелец может изменить название'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Название: от 1 до 80 символов'; end if;
 update public.households set name=trim(p_name),settings_version=settings_version+1,revision=revision+1 where id=p_household and settings_version=p_version;
 if not found then raise exception 'Название уже изменено. Обновите данные'; end if;
end $$;
create function public.save_category(p_household uuid,p_id uuid,p_name text,p_kind text,p_archived boolean,p_version integer) returns void
language plpgsql security definer set search_path='' as $$ declare c public.categories; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 60 or p_kind is null or p_kind not in ('expense','income') or p_archived is null or p_version is null or p_version<0 then raise exception 'Проверьте категорию'; end if;
 select * into c from public.categories where id=p_id;
 if found then
  if c.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if c.version<>p_version then raise exception 'Категория уже изменена. Обновите данные'; end if;
  if c.kind<>p_kind then raise exception 'Тип существующей категории нельзя менять'; end if;
  if p_archived and exists(select 1 from public.recurring_terms t where category_id=p_id and active and not exists(select 1 from public.recurring_terms newer where newer.rule_id=t.rule_id and newer.effective_month>t.effective_month)) then raise exception 'Сначала выберите другую категорию в обязательных платежах'; end if;
 else
  if p_version<>0 then raise exception 'Категория уже удалена'; end if;
 end if;
 if not p_archived and exists(select 1 from public.categories where household_id=p_household and id<>p_id and kind=p_kind and not archived and lower(name)=lower(trim(p_name))) then raise exception 'Такая категория уже есть'; end if;
 insert into public.categories(id,household_id,name,kind,archived) values(p_id,p_household,trim(p_name),p_kind,p_archived)
 on conflict(id) do update set name=excluded.name,archived=excluded.archived,version=public.categories.version+1;
end $$;

create function public.save_recurring(p_household uuid,p_id uuid,p_version integer,p_month date,p_name text,p_category uuid,p_amount numeric,p_day integer,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$ declare r public.recurring_rules; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_version is null or p_version<0 or p_active is null or p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Проверьте название платежа'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'1900-01-01' or p_month>'9998-12-01' then raise exception 'Выберите месяц'; end if;
 if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) or p_day is null or p_day not between 1 and 31 then raise exception 'Проверьте сумму и день месяца'; end if;
 if not exists(select 1 from public.categories where id=p_category and household_id=p_household and kind='expense' and not archived) then raise exception 'Выберите активную категорию расходов'; end if;
 select * into r from public.recurring_rules where id=p_id;
 if found then
  if r.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if r.version<>p_version then raise exception 'Платёж уже изменён. Обновите данные'; end if;
  update public.recurring_rules set version=version+1 where id=p_id;
 else
  if p_version<>0 then raise exception 'Платёж уже удалён'; end if;
  insert into public.recurring_rules(id,household_id) values(p_id,p_household);
 end if;
 insert into public.recurring_terms values(p_id,p_household,p_month,trim(p_name),p_category,p_amount,p_day,p_active)
 on conflict(rule_id,effective_month) do update set name=excluded.name,category_id=excluded.category_id,amount=excluded.amount,due_day=excluded.due_day,active=excluded.active;
end $$;

create function public.pay_recurring(p_household uuid,p_id uuid,p_month date,p_version integer,p_date date) returns public.transactions
language plpgsql security definer set search_path='' as $$ declare term public.recurring_terms; t public.transactions; v integer; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_month is null or extract(day from p_month)<>1 or p_month<'1900-01-01' or p_month>'9998-12-01' or p_date is null or p_date<p_month or p_date>=p_month+interval '1 month' then raise exception 'Дата оплаты должна быть в выбранном месяце'; end if;
 select version into v from public.recurring_rules where id=p_id and household_id=p_household;
 if v is null then raise exception 'Платёж не найден'; end if;
 select * into t from public.transactions where recurring_id=p_id and recurring_month=p_month;
 if found then return t; end if;
 if p_version is null or p_version<>v then raise exception 'Платёж уже изменён. Обновите данные'; end if;
 select * into term from public.recurring_terms where rule_id=p_id and effective_month<=p_month order by effective_month desc limit 1;
 if not found or not term.active then raise exception 'Платёж отключён для этого месяца'; end if;
 insert into public.transactions(household_id,user_id,updated_by,category_id,kind,amount,occurred_on,comment,recurring_id,recurring_month)
 values(p_household,auth.uid(),auth.uid(),term.category_id,'expense',term.amount,p_date,term.name,p_id,p_month) returning * into t;
 return t;
end $$;

create function public.save_savings(p_household uuid,p_id uuid,p_version integer,p_kind text,p_amount numeric,p_date date,p_comment text,p_delete boolean default false) returns void
language plpgsql security definer set search_path='' as $$ declare e public.savings_entries; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_version is null or p_version<0 or p_delete is null then raise exception 'Некорректная версия'; end if;
 select * into e from public.savings_entries where id=p_id;
 if found then
  if e.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if e.version<>p_version then
   if not p_delete and p_version=0 and e.user_id=auth.uid() and e.kind=p_kind and e.amount=p_amount and e.occurred_on=p_date and e.comment is not distinct from nullif(trim(p_comment),'') then return; end if;
   raise exception 'Перевод уже изменён. Обновите данные';
  end if;
 elsif p_delete then return;
 elsif p_version<>0 then raise exception 'Перевод уже удалён'; end if;
 if p_delete then delete from public.savings_entries where id=p_id;
 else
  if p_kind is null or p_kind not in ('opening','deposit','withdrawal') or p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Проверьте сумму и тип перевода'; end if;
  if p_date is null or p_date<'1900-01-01' or p_date>'9998-12-31' or length(p_comment)>2000 then raise exception 'Проверьте дату и комментарий'; end if;
  if p_kind='opening' and exists(select 1 from public.savings_entries where household_id=p_household and kind='opening' and id<>p_id) then raise exception 'Начальный остаток уже задан'; end if;
  insert into public.savings_entries(id,household_id,kind,amount,occurred_on,comment,user_id,updated_by)
  values(p_id,p_household,p_kind,p_amount,p_date,nullif(trim(p_comment),''),auth.uid(),auth.uid())
  on conflict(id) do update set kind=excluded.kind,amount=excluded.amount,occurred_on=excluded.occurred_on,comment=excluded.comment,updated_by=auth.uid(),version=public.savings_entries.version+1;
 end if;
 if exists(select 1 from (select sum(case when kind='withdrawal' then -amount else amount end) over(order by occurred_on range between unbounded preceding and current row) balance from public.savings_entries where household_id=p_household) q where balance<0) then raise exception 'На накопительном счёте недостаточно средств на эту дату'; end if;
end $$;

create or replace function public.save_transaction(p_household uuid,p_id uuid,p_version integer,p_category uuid,p_kind text,p_amount numeric,p_date date,p_comment text) returns public.transactions
language plpgsql security definer set search_path='' as $$
declare t public.transactions; begin
  if not public.is_member(p_household) then raise exception 'Доступ к семье закрыт'; end if;
  perform 1 from public.households where id=p_household for update;
  if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Некорректная сумма'; end if;
  if p_date is null or p_date<'1900-01-01' or p_date>'9998-12-31' then raise exception 'Некорректная дата'; end if;
  if p_version is null or p_version<0 then raise exception 'Некорректная версия'; end if;
  if p_kind is null or p_kind not in ('income','expense') or not exists(select 1 from public.categories where id=p_category and household_id=p_household and kind=p_kind and (not archived or exists(select 1 from public.transactions where id=p_id and category_id=p_category and household_id=p_household and p_version>0))) then raise exception 'Некорректная категория'; end if;
  if length(p_comment)>2000 then raise exception 'Комментарий слишком длинный'; end if;
  -- Serializes retries of the same operation, including the initial insert.
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select * into t from public.transactions where id=p_id for update;
  if found then
    if t.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
    if p_version=0 and t.user_id=auth.uid() and t.category_id=p_category and t.kind=p_kind and t.amount=p_amount and t.occurred_on=p_date and t.comment is not distinct from nullif(trim(p_comment),'') then return t; end if;
    if p_version=0 or t.version<>p_version then raise exception 'Операция уже изменена. Обновите данные и откройте её заново'; end if;
    if t.recurring_id is not null and (p_kind<>'expense' or p_date<t.recurring_month or p_date>=t.recurring_month+interval '1 month') then raise exception 'Оплата обязательного платежа должна остаться расходом в своём месяце'; end if;
    update public.transactions set category_id=p_category,kind=p_kind,amount=p_amount,occurred_on=p_date,comment=nullif(trim(p_comment),''),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into t;
  else
    if p_version<>0 then raise exception 'Операция уже удалена'; end if;
    insert into public.transactions(id,household_id,user_id,category_id,kind,amount,occurred_on,comment,updated_by)
    values(p_id,p_household,auth.uid(),p_category,p_kind,p_amount,p_date,nullif(trim(p_comment),''),auth.uid()) returning * into t;
  end if;
  return t;
end $$;

create or replace function public.delete_transaction(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare t public.transactions; begin
  select * into t from public.transactions where id=p_id;
  if not found then return; end if;
  if not public.is_member(t.household_id) then raise exception 'Доступ запрещён'; end if;
  perform 1 from public.households where id=t.household_id for update;
  select * into t from public.transactions where id=p_id for update;
  if not found then return; end if;
  if not public.is_member(t.household_id) then raise exception 'Доступ запрещён'; end if;
  if p_version is null or t.version<>p_version then raise exception 'Операция уже изменена. Обновите данные перед удалением'; end if;
  delete from public.transactions where id=p_id;
end $$;

create or replace function public.save_budget(p_household uuid,p_category uuid,p_month date,p_amount numeric,p_version integer) returns public.budgets
language plpgsql security definer set search_path='' as $$
declare b public.budgets; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  perform 1 from public.households where id=p_household for update;
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

create or replace function public.copy_budget(p_household uuid,p_month date) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  perform 1 from public.households where id=p_household for update;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
  insert into public.budgets(household_id,category_id,month,amount)
  select household_id,category_id,p_month,amount from public.budgets where household_id=p_household and month=(p_month-interval '1 month')::date and exists(select 1 from public.categories c where c.id=category_id and not c.archived)
  on conflict(household_id,category_id,month) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;

create or replace function public.budget_snapshot(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'family',jsonb_build_object('id',h.id,'name',h.name,'created_by',h.created_by,'settings_version',h.settings_version),
    'revision',h.revision,
    'recurring',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'name',term.name,'category_id',term.category_id,'amount',term.amount,'due_day',term.due_day,'active',term.active,'effective_month',term.effective_month,'payment',case when t.id is null then null else to_jsonb(t) end) order by term.due_day,term.name)
      from public.recurring_rules r join lateral(select * from public.recurring_terms rt where rt.rule_id=r.id and rt.effective_month<=p_month order by rt.effective_month desc limit 1) term on true
      left join public.transactions t on t.recurring_id=r.id and t.recurring_month=p_month where r.household_id=h.id),'[]'::jsonb),
    'savings',jsonb_build_object(
      'balance_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where household_id=h.id and occurred_on<p_month+interval '1 month'),'0'),
      'transfer_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where household_id=h.id and kind<>'opening' and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'0'),
      'has_opening',exists(select 1 from public.savings_entries where household_id=h.id and kind='opening'),
      'entries',coalesce((select jsonb_agg(e order by e.occurred_on desc,e.id) from public.savings_entries e where e.household_id=h.id and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'[]'::jsonb)),
    'categories',coalesce((select jsonb_agg(c order by c.kind,c.name) from public.categories c where c.household_id=h.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(m order by m.user_id) from public.members m where m.household_id=h.id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(b) from public.budgets b where b.household_id=h.id and b.month=p_month),'[]'::jsonb),
    'summary',coalesce((select jsonb_agg(s) from (select t.category_id,t.kind,((sum(t.amount)*100)::numeric(30,0))::text as cents from public.transactions t where t.household_id=h.id and t.occurred_on>=p_month and t.occurred_on<(p_month+interval '1 month') group by t.category_id,t.kind) s),'[]'::jsonb)
  ) from public.households h join public.members me on me.household_id=h.id and me.user_id=auth.uid();
$$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rename_family','save_category','save_recurring','pay_recurring','save_savings') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;

begin;
create table public.savings_accounts (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 60), version integer not null default 1,
 is_default boolean not null default false, unique(id,household_id)
);
create unique index savings_account_name on public.savings_accounts(household_id,lower(name));
create unique index savings_account_default on public.savings_accounts(household_id) where is_default;
alter table public.savings_accounts enable row level security;
create policy savings_accounts_read on public.savings_accounts for select to authenticated using(public.is_member(household_id));
revoke all on public.savings_accounts from public,anon,authenticated;
grant select on public.savings_accounts to authenticated;
insert into public.savings_accounts(household_id,name,is_default) select id,'Накопления',true from public.households;
alter table public.savings_entries add column account_id uuid;
update public.savings_entries e set account_id=a.id from public.savings_accounts a where a.household_id=e.household_id and a.is_default;
alter table public.savings_entries alter column account_id set not null;
alter table public.savings_entries add constraint savings_account_family foreign key(account_id,household_id) references public.savings_accounts(id,household_id);
drop index public.savings_one_opening;
create unique index savings_one_opening on public.savings_entries(account_id) where kind='opening';
create index savings_account_date on public.savings_entries(account_id,occurred_on);
create trigger savings_account_revision after insert or update or delete on public.savings_accounts for each row execute function public.bump_family_revision();

create function public.save_savings_account(p_household uuid,p_id uuid,p_name text,p_version integer) returns void
language plpgsql security definer set search_path='' as $$ declare a public.savings_accounts; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 60 or p_version is null or p_version<0 then raise exception 'Проверьте название счёта'; end if;
 select * into a from public.savings_accounts where id=p_id;
 if found then
  if a.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if a.version<>p_version then
   if p_version=0 and a.name=trim(p_name) then return; end if;
   raise exception 'Счёт уже изменён. Обновите данные';
  end if;
 elsif p_version<>0 then raise exception 'Счёт не найден'; end if;
 if exists(select 1 from public.savings_accounts where household_id=p_household and lower(name)=lower(trim(p_name)) and id<>p_id) then raise exception 'Счёт с таким названием уже есть'; end if;
 insert into public.savings_accounts(id,household_id,name,is_default) values(p_id,p_household,trim(p_name),not exists(select 1 from public.savings_accounts where household_id=p_household))
 on conflict(id) do update set name=excluded.name,version=public.savings_accounts.version+1;
end $$;
revoke all on function public.save_savings_account(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.save_savings_account(uuid,uuid,text,integer) to authenticated;

drop function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean);
create function public.save_savings(p_household uuid,p_id uuid,p_version integer,p_kind text,p_amount numeric,p_date date,p_comment text,p_delete boolean default false,p_account uuid default null) returns void
language plpgsql security definer set search_path='' as $$ declare e public.savings_entries; account uuid; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_version is null or p_version<0 or p_delete is null then raise exception 'Некорректная версия'; end if;
 select * into e from public.savings_entries where id=p_id;
 if found then
  if e.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if e.version<>p_version then
   if not p_delete and p_version=0 and e.user_id=auth.uid() and e.kind=p_kind and e.amount=p_amount and e.occurred_on=p_date and e.comment is not distinct from nullif(trim(p_comment),'') and (p_account is null or e.account_id=p_account) then return; end if;
   raise exception 'Перевод уже изменён. Обновите данные';
  end if;
 elsif p_delete then return;
 elsif p_version<>0 then raise exception 'Перевод уже удалён'; end if;
 account:=coalesce(p_account,e.account_id);
 if account is null then
  select id into account from public.savings_accounts where household_id=p_household and is_default;
  if account is null then insert into public.savings_accounts(household_id,name,is_default) values(p_household,'Накопления',true) returning id into account; end if;
 end if;
 if not exists(select 1 from public.savings_accounts where id=account and household_id=p_household) then raise exception 'Счёт не найден в этой семье'; end if;
 if p_delete then delete from public.savings_entries where id=p_id;
 else
  if p_kind is null or p_kind not in ('opening','deposit','withdrawal') or p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Проверьте сумму и тип перевода'; end if;
  if p_date is null or p_date<'1900-01-01' or p_date>'9998-12-31' or length(p_comment)>2000 then raise exception 'Проверьте дату и комментарий'; end if;
  if p_kind='opening' and exists(select 1 from public.savings_entries where account_id=account and kind='opening' and id<>p_id) then raise exception 'Начальный остаток уже задан'; end if;
  insert into public.savings_entries(id,household_id,kind,amount,occurred_on,comment,user_id,updated_by,account_id)
  values(p_id,p_household,p_kind,p_amount,p_date,nullif(trim(p_comment),''),auth.uid(),auth.uid(),account)
  on conflict(id) do update set account_id=excluded.account_id,kind=excluded.kind,amount=excluded.amount,occurred_on=excluded.occurred_on,comment=excluded.comment,updated_by=auth.uid(),version=public.savings_entries.version+1;
 end if;
 if exists(select 1 from (select sum(case when kind='withdrawal' then -amount else amount end) over(partition by account_id order by occurred_on range between unbounded preceding and current row) balance from public.savings_entries where household_id=p_household) q where balance<0) then raise exception 'На накопительном счёте недостаточно средств на эту дату'; end if;
end $$;
revoke all on function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) to authenticated;
create or replace function public.budget_snapshot(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'family',jsonb_build_object('id',h.id,'name',h.name,'created_by',h.created_by,'settings_version',h.settings_version),
    'revision',h.revision,
    'recurring',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'name',term.name,'category_id',term.category_id,'amount',term.amount,'due_day',term.due_day,'active',term.active,'effective_month',term.effective_month,'payment',case when t.id is null then null else to_jsonb(t) end) order by term.due_day,term.name)
      from public.recurring_rules r join lateral(select * from public.recurring_terms rt where rt.rule_id=r.id and rt.effective_month<=p_month order by rt.effective_month desc limit 1) term on true
      left join public.transactions t on t.recurring_id=r.id and t.recurring_month=p_month where r.household_id=h.id),'[]'::jsonb),
    'savings',jsonb_build_object(
      'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'version',a.version,'is_default',a.is_default,
       'balance_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where account_id=a.id and occurred_on<p_month+interval '1 month'),'0'),
       'transfer_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where account_id=a.id and kind<>'opening' and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'0'),
       'has_opening',exists(select 1 from public.savings_entries where account_id=a.id and kind='opening')) order by a.is_default desc,a.name) from public.savings_accounts a where a.household_id=h.id),'[]'::jsonb),
      'balance_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where household_id=h.id and occurred_on<p_month+interval '1 month'),'0'),
      'transfer_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from public.savings_entries where household_id=h.id and kind<>'opening' and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'0'),
      'has_opening',exists(select 1 from public.savings_entries where household_id=h.id and kind='opening'),
      'entries',coalesce((select jsonb_agg(e order by e.occurred_on desc,e.id) from public.savings_entries e where e.household_id=h.id and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'[]'::jsonb)),
    'categories',coalesce((select jsonb_agg(c order by c.kind,c.name) from public.categories c where c.household_id=h.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(m order by m.user_id) from public.members m where m.household_id=h.id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(b) from public.budgets b where b.household_id=h.id and b.month=p_month),'[]'::jsonb),
    'summary',coalesce((select jsonb_agg(s) from (select t.category_id,t.kind,((sum(t.amount)*100)::numeric(30,0))::text as cents from public.transactions t where t.household_id=h.id and t.occurred_on>=p_month and t.occurred_on<(p_month+interval '1 month') group by t.category_id,t.kind) s),'[]'::jsonb)
  ) from public.households h join public.members me on me.household_id=h.id and me.user_id=auth.uid();
$$;
commit;
