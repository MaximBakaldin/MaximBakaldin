begin;
alter table public.savings_accounts add column annual_rate numeric check(annual_rate between 0 and 1000 and annual_rate=round(annual_rate,4)), add column interest_start date check(interest_start between '1900-01-01' and '9998-12-31'), add column interest_frequency text not null default 'monthly' check(interest_frequency in ('daily','monthly'));
alter table public.savings_accounts add constraint interest_start_required check(annual_rate is null or annual_rate=0 or interest_start is not null);

-- Derived credits are deterministic. Re-reading never adds a second credit.
-- Only completed days/months in Yekaterinburg are credited; future dates are excluded.
create function public.savings_calculated_entries(p_account uuid,p_until date)
returns table(id uuid,household_id uuid,account_id uuid,kind text,amount numeric,occurred_on date,comment text,user_id uuid,updated_by uuid,version integer)
language plpgsql stable security invoker set search_path='' as $$
declare a public.savings_accounts; b numeric:=0; accrued numeric:=0; credit numeric; d record; stop_date date; year_days integer;
begin
 select * into a from public.savings_accounts where savings_accounts.id=p_account;
 if not found then return; end if;
 return query select e.id,e.household_id,e.account_id,e.kind,e.amount,e.occurred_on,e.comment,e.user_id,e.updated_by,e.version from public.savings_entries e where e.account_id=p_account and e.occurred_on<=p_until;
 if coalesce(a.annual_rate,0)=0 or a.interest_start is null then return; end if;
 stop_date:=least(p_until,(now() at time zone 'Asia/Yekaterinburg')::date-1);
 if a.interest_start>stop_date then return; end if;
 select coalesce(sum(case when e.kind='withdrawal' then -e.amount else e.amount end),0) into b from public.savings_entries e where e.account_id=p_account and e.occurred_on<a.interest_start;
 for d in
  select days.day::date as day,coalesce(m.delta,0) as delta
  from pg_catalog.generate_series(a.interest_start::timestamp,stop_date::timestamp,interval '1 day') days(day)
  left join (select e.occurred_on,sum(case when e.kind='withdrawal' then -e.amount else e.amount end) delta from public.savings_entries e where e.account_id=p_account and e.occurred_on between a.interest_start and stop_date group by e.occurred_on) m on m.occurred_on=days.day::date
  order by days.day
 loop
  b:=b+d.delta;
  year_days:=make_date(extract(year from d.day)::int+1,1,1)-make_date(extract(year from d.day)::int,1,1);
  accrued:=accrued+greatest(b,0)*100*round(a.annual_rate*10000);
  if a.interest_frequency='daily' or d.day=(date_trunc('month',d.day)+interval '1 month - 1 day')::date then
   credit:=round(accrued/(year_days::numeric*1000000))/100;accrued:=0;
   if credit>0 then
    b:=b+credit;
    id:=md5('interest-'||a.id::text||'-'||d.day::text)::uuid;household_id:=a.household_id;account_id:=a.id;kind:='interest';amount:=credit;occurred_on:=d.day;comment:='Автоматическое начисление процентов';user_id:=null;updated_by:=null;version:=0;
    return next;
   end if;
  end if;
 end loop;
end $$;
revoke all on function public.savings_calculated_entries(uuid,date) from public,anon,authenticated;
grant execute on function public.savings_calculated_entries(uuid,date) to authenticated;

create function public.check_savings_balances(p_household uuid) returns void language plpgsql security invoker set search_path='' as $$ begin
 if exists(select 1 from (
  select sum(case when e.kind='withdrawal' then -e.amount else e.amount end) over(partition by a.id order by e.occurred_on range between unbounded preceding and current row) balance
  from public.savings_accounts a cross join lateral public.savings_calculated_entries(a.id,'9998-12-31') e where a.household_id=p_household
 ) q where balance<0) then raise exception 'На накопительном счёте недостаточно средств на эту дату'; end if;
end $$;
revoke all on function public.check_savings_balances(uuid) from public,anon,authenticated;
drop function public.save_savings_account(uuid,uuid,text,integer);
create function public.save_savings_account(p_household uuid,p_id uuid,p_name text,p_version integer,p_rate numeric default -1,p_start date default null,p_frequency text default 'monthly') returns void
language plpgsql security definer set search_path='' as $$ declare a public.savings_accounts; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 60 or p_version is null or p_version<0 then raise exception 'Проверьте название счёта'; end if;
 select * into a from public.savings_accounts where id=p_id;
 if found then
  if a.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
  if a.version<>p_version then
   if p_version=0 and a.name=trim(p_name) and (p_rate=-1 or (a.annual_rate is not distinct from p_rate and a.interest_start is not distinct from p_start and a.interest_frequency=p_frequency)) then return; end if;
   raise exception 'Счёт уже изменён. Обновите данные';
  end if;
 elsif p_version<>0 then raise exception 'Счёт не найден'; end if;
 if p_rate is distinct from -1 and ((p_rate is not null and (p_rate<0 or p_rate>1000 or p_rate<>round(p_rate,4))) or (coalesce(p_rate,0)>0 and p_start is null) or p_frequency is null or p_frequency not in ('daily','monthly')) then raise exception 'Проверьте ставку, дату и период начисления'; end if;
 if exists(select 1 from public.savings_accounts where household_id=p_household and lower(name)=lower(trim(p_name)) and id<>p_id) then raise exception 'Счёт с таким названием уже есть'; end if;
 insert into public.savings_accounts(id,household_id,name,is_default) values(p_id,p_household,trim(p_name),not exists(select 1 from public.savings_accounts where household_id=p_household))
 on conflict(id) do update set name=excluded.name,version=public.savings_accounts.version+1;
 if p_rate is distinct from -1 then update public.savings_accounts set annual_rate=p_rate,interest_start=p_start,interest_frequency=p_frequency where id=p_id; end if;
 perform public.check_savings_balances(p_household);
end $$;
revoke all on function public.save_savings_account(uuid,uuid,text,integer,numeric,date,text) from public,anon,authenticated;
grant execute on function public.save_savings_account(uuid,uuid,text,integer,numeric,date,text) to authenticated;

create or replace function public.save_savings(p_household uuid,p_id uuid,p_version integer,p_kind text,p_amount numeric,p_date date,p_comment text,p_delete boolean default false,p_account uuid default null) returns void
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
 perform public.check_savings_balances(p_household);
end $$;
revoke all on function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) to authenticated;
create or replace function public.budget_snapshot(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  with ledger as materialized (select e.* from public.savings_accounts a cross join lateral public.savings_calculated_entries(a.id,(p_month+interval '1 month - 1 day')::date) e)
  select jsonb_build_object(
    'family',jsonb_build_object('id',h.id,'name',h.name,'created_by',h.created_by,'settings_version',h.settings_version),
    'revision',h.revision,
    'recurring',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'name',term.name,'category_id',term.category_id,'amount',term.amount,'due_day',term.due_day,'active',term.active,'effective_month',term.effective_month,'payment',case when t.id is null then null else to_jsonb(t) end) order by term.due_day,term.name)
      from public.recurring_rules r join lateral(select * from public.recurring_terms rt where rt.rule_id=r.id and rt.effective_month<=p_month order by rt.effective_month desc limit 1) term on true
      left join public.transactions t on t.recurring_id=r.id and t.recurring_month=p_month where r.household_id=h.id),'[]'::jsonb),
    'savings',jsonb_build_object(
      'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'version',a.version,'is_default',a.is_default,'annual_rate',a.annual_rate,'interest_start',a.interest_start,'interest_frequency',a.interest_frequency,
       'interest_cents',coalesce((select (sum(amount)*100)::numeric(30,0)::text from ledger where account_id=a.id and kind='interest' and occurred_on>=p_month),'0'),
       'balance_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from ledger where account_id=a.id and occurred_on<p_month+interval '1 month'),'0'),
       'transfer_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from ledger where account_id=a.id and kind not in ('opening','interest') and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'0'),
       'has_opening',exists(select 1 from public.savings_entries where account_id=a.id and kind='opening')) order by a.is_default desc,a.name) from public.savings_accounts a where a.household_id=h.id),'[]'::jsonb),
      'balance_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from ledger where household_id=h.id and occurred_on<p_month+interval '1 month'),'0'),
      'transfer_cents',coalesce((select (sum(case when kind='withdrawal' then -amount else amount end)*100)::numeric(30,0)::text from ledger where household_id=h.id and kind not in ('opening','interest') and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'0'),
      'has_opening',exists(select 1 from public.savings_entries where household_id=h.id and kind='opening'),
      'entries',coalesce((select jsonb_agg(e order by e.occurred_on desc,e.id) from ledger e where e.household_id=h.id and occurred_on>=p_month and occurred_on<p_month+interval '1 month'),'[]'::jsonb)),
    'categories',coalesce((select jsonb_agg(c order by c.kind,c.name) from public.categories c where c.household_id=h.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(m order by m.user_id) from public.members m where m.household_id=h.id),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(b) from public.budgets b where b.household_id=h.id and b.month=p_month),'[]'::jsonb),
    'summary',coalesce((select jsonb_agg(s) from (select t.category_id,t.kind,((sum(t.amount)*100)::numeric(30,0))::text as cents from public.transactions t where t.household_id=h.id and t.occurred_on>=p_month and t.occurred_on<(p_month+interval '1 month') group by t.category_id,t.kind) s),'[]'::jsonb)
  ) from public.households h join public.members me on me.household_id=h.id and me.user_id=auth.uid();
$$;

commit;
