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
