-- Optional monthly cap. Existing category budgets and financial history are unchanged.
begin;
create table public.monthly_budgets (
 household_id uuid not null references public.households(id) on delete cascade,
 month date not null check(extract(day from month)=1),
 amount numeric(14,2) not null check(amount>=0 and amount<1000000000000),
 version integer not null default 1,
 primary key(household_id,month)
);
alter table public.monthly_budgets enable row level security;
revoke all on public.monthly_budgets from public,anon,authenticated;
grant select on public.monthly_budgets to authenticated;
create policy monthly_budget_read on public.monthly_budgets for select to authenticated using(public.is_member(household_id));
create trigger monthly_budget_revision after insert or update or delete on public.monthly_budgets for each row execute function public.bump_family_revision();

-- All three budget writers lock the household first, including when the cap is absent.
-- This prevents two devices from allocating the same remaining amount concurrently.
create function public.save_monthly_budget(p_household uuid,p_month date,p_amount numeric,p_version integer) returns public.monthly_budgets
language plpgsql security definer set search_path='' as $$
declare b public.monthly_budgets; allocated numeric; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_amount is null or p_amount<0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Некорректная сумма'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
 if p_version is null or p_version<0 then raise exception 'Некорректная версия'; end if;
 select coalesce(sum(amount),0) into allocated from public.budgets where household_id=p_household and month=p_month;
 if p_amount<allocated then raise exception 'Общий лимит меньше суммы лимитов категорий. Сначала уменьшите лимиты категорий'; end if;
 select * into b from public.monthly_budgets where household_id=p_household and month=p_month for update;
 if found then
  if b.version<>p_version then raise exception 'Общий лимит уже изменён. Обновите данные перед сохранением'; end if;
  update public.monthly_budgets set amount=p_amount,version=version+1 where household_id=p_household and month=p_month returning * into b;
 else
  if p_version<>0 then raise exception 'Общий лимит уже изменён. Обновите данные перед сохранением'; end if;
  insert into public.monthly_budgets(household_id,month,amount) values(p_household,p_month,p_amount) returning * into b;
 end if;
 return b;
end $$;
revoke all on function public.save_monthly_budget(uuid,date,numeric,integer) from public,anon,authenticated;
grant execute on function public.save_monthly_budget(uuid,date,numeric,integer) to authenticated;

create or replace function public.save_budget(p_household uuid,p_category uuid,p_month date,p_amount numeric,p_version integer) returns public.budgets
language plpgsql security definer set search_path='' as $$
declare b public.budgets; cap numeric; allocated numeric; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  perform 1 from public.households where id=p_household for update;
  if p_amount is null or p_amount<0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Некорректная сумма'; end if;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
  if p_version is null or p_version<0 then raise exception 'Некорректная версия'; end if;
  if not exists(select 1 from public.categories where id=p_category and household_id=p_household and kind='expense') then raise exception 'Некорректная категория'; end if;
  select amount into cap from public.monthly_budgets where household_id=p_household and month=p_month;
  select coalesce(sum(amount),0) into allocated from public.budgets where household_id=p_household and month=p_month and category_id<>p_category;
  if cap is not null and allocated+p_amount>cap then raise exception 'Сумма лимитов категорий превышает общий лимит месяца'; end if;
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
declare n integer; cap numeric; allocated numeric; begin
  if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
  perform 1 from public.households where id=p_household for update;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Выберите месяц'; end if;
  insert into public.monthly_budgets(household_id,month,amount)
  select household_id,p_month,amount from public.monthly_budgets where household_id=p_household and month=(p_month-interval '1 month')::date
  on conflict(household_id,month) do nothing;
  insert into public.budgets(household_id,category_id,month,amount)
  select household_id,category_id,p_month,amount from public.budgets where household_id=p_household and month=(p_month-interval '1 month')::date and exists(select 1 from public.categories c where c.id=category_id and not c.archived)
  on conflict(household_id,category_id,month) do nothing;
  get diagnostics n=row_count;
  select amount into cap from public.monthly_budgets where household_id=p_household and month=p_month;
  select coalesce(sum(amount),0) into allocated from public.budgets where household_id=p_household and month=p_month;
  if cap is not null and allocated>cap then raise exception 'Копирование превысит общий лимит месяца. Увеличьте лимит или распределите категории вручную'; end if;
  return n;
end $$;

create or replace function public.budget_snapshot(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; f uuid; stop_date date:=(p_month+interval '1 month - 1 day')::date; cards public.card_settings; card_amount numeric; accounts jsonb; goals jsonb; begin
 result:=public.budget_snapshot_v081(p_month); if result is null then return null; end if;
 f:=(result->'family'->>'id')::uuid;
 select * into cards from public.card_settings where household_id=f;
 if cards.household_id is not null and cards.opening_on<=stop_date then
  select cards.opening_amount+coalesce((select sum(case when kind='income' then amount else -amount end) from public.transactions where household_id=f and occurred_on between cards.opening_on and stop_date),0)
   -coalesce((select sum(case when kind='deposit' then amount else -amount end) from public.savings_entries where household_id=f and kind in ('deposit','withdrawal') and transfer_id is null and occurred_on between cards.opening_on and stop_date),0) into card_amount;
 end if;
 result:=result||jsonb_build_object('cards',jsonb_build_object('opening_amount',cards.opening_amount,'opening_on',cards.opening_on,'version',coalesce(cards.version,0),'balance_cents',case when card_amount is null then null else (card_amount*100)::numeric(30,0)::text end));
 select coalesce(jsonb_agg(a.value||jsonb_build_object('goal_id',l.goal_id)),'[]'::jsonb) into accounts
 from jsonb_array_elements(result->'savings'->'accounts') a(value)
 left join lateral(select goal_id from public.savings_goal_links where account_id=(a.value->>'id')::uuid and effective_on<=stop_date order by effective_on desc,id desc limit 1) l on true;
 result:=jsonb_set(result,'{savings,accounts}',accounts);
 result:=jsonb_set(result,'{savings,entries}',coalesce((select jsonb_agg(e.value||jsonb_build_object('goal_id',raw.goal_id,'transfer_id',raw.transfer_id)) from jsonb_array_elements(result->'savings'->'entries') e(value) left join public.savings_entries raw on raw.id=(e.value->>'id')::uuid),'[]'::jsonb));
 select coalesce(jsonb_agg(v.value||jsonb_build_object('baseline',g.baseline,
  'paid_cents',coalesce((select (sum(amount)*100)::numeric(30,0)::text from public.transactions where goal_id=g.id and occurred_on<=stop_date),'0'),
  'paid_month_cents',coalesce((select (sum(amount)*100)::numeric(30,0)::text from public.transactions where goal_id=g.id and occurred_on between p_month and stop_date),'0'),
  'contribution_cents',coalesce((select (sum(case when e.kind='withdrawal' then -e.amount else e.amount end)*100)::numeric(30,0)::text
    from public.savings_accounts a cross join lateral public.savings_calculated_entries(a.id,stop_date) e
    left join public.savings_entries raw on raw.id=e.id
    left join lateral(select goal_id from public.savings_goal_links where account_id=a.id and effective_on<=e.occurred_on order by effective_on desc,id desc limit 1) l on true
    where a.household_id=f and e.kind<>'opening' and e.occurred_on between p_month and stop_date
      and (case when e.kind='interest' then l.goal_id else raw.goal_id end)=g.id),'0')) order by g.created_at,g.id),'[]'::jsonb)
 into goals from public.financial_goals g cross join lateral(select value from public.goal_versions where goal_id=g.id and effective_on<=stop_date order by effective_on desc,id desc limit 1) v where g.household_id=f;
 result:=result||jsonb_build_object('goals',goals,'transfers',coalesce((select jsonb_agg(t order by occurred_on desc,id) from public.savings_transfers t where household_id=f),'[]'::jsonb));
 result:=result||jsonb_build_object('monthly_budget',(select to_jsonb(b) from public.monthly_budgets b where b.household_id=f and b.month=p_month));
 return result;
end $$;

commit;
