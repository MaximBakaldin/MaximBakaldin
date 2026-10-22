begin;
-- Additive upgrade: existing cash movements are retained unchanged.
create table public.financial_goals (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 60),
 target_amount numeric not null check(target_amount>0 and target_amount<1000000000000 and target_amount=round(target_amount,2)),
 deadline date not null check(deadline between '1900-01-01' and '9998-12-31'),
 monthly_amount numeric not null check(monthly_amount>=0 and monthly_amount<1000000000000 and monthly_amount=round(monthly_amount,2)),
 archived boolean not null default false, version integer not null default 1,
 baseline jsonb, created_at timestamptz not null default now(), unique(id,household_id)
);
create table public.goal_versions (
 id bigint generated always as identity primary key, household_id uuid not null references public.households(id) on delete cascade,
 goal_id uuid not null, effective_on date not null, value jsonb not null,
 foreign key(goal_id,household_id) references public.financial_goals(id,household_id)
);
create index goal_versions_lookup on public.goal_versions(goal_id,effective_on desc,id desc);
create table public.savings_goal_links (
 id bigint generated always as identity primary key, household_id uuid not null references public.households(id) on delete cascade,
 account_id uuid not null, goal_id uuid, effective_on date not null,
 foreign key(account_id,household_id) references public.savings_accounts(id,household_id),
 foreign key(goal_id,household_id) references public.financial_goals(id,household_id)
);
create index savings_goal_links_lookup on public.savings_goal_links(account_id,effective_on desc,id desc);
create table public.card_settings (
 household_id uuid primary key references public.households(id) on delete cascade,
 opening_amount numeric not null check(opening_amount>=0 and opening_amount<1000000000000 and opening_amount=round(opening_amount,2)),
 opening_on date not null check(opening_on between '1900-01-01' and '9998-12-31'), version integer not null default 1
);
create table public.savings_transfers (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 from_account uuid not null, to_account uuid not null, amount numeric not null check(amount>0 and amount<1000000000000 and amount=round(amount,2)),
 occurred_on date not null check(occurred_on between '1900-01-01' and '9998-12-31'), comment text check(length(comment)<=2000),
 version integer not null default 1, user_id uuid not null references auth.users(id),
 debit_id uuid not null unique, credit_id uuid not null unique,
 check(from_account<>to_account), unique(id,household_id),
 foreign key(from_account,household_id) references public.savings_accounts(id,household_id),
 foreign key(to_account,household_id) references public.savings_accounts(id,household_id)
);
alter table public.savings_entries add column goal_id uuid, add column transfer_id uuid;
alter table public.savings_entries add foreign key(goal_id,household_id) references public.financial_goals(id,household_id);
alter table public.savings_entries add foreign key(transfer_id,household_id) references public.savings_transfers(id,household_id);
alter table public.transactions add column goal_id uuid;
alter table public.transactions add foreign key(goal_id,household_id) references public.financial_goals(id,household_id);
alter table public.transactions add check(goal_id is null or kind='expense');
create index savings_entries_goal on public.savings_entries(goal_id,occurred_on);
create index savings_entries_transfer on public.savings_entries(transfer_id);
create index transactions_goal on public.transactions(goal_id,occurred_on);
do $$ declare tab text; begin
 foreach tab in array array['financial_goals','goal_versions','savings_goal_links','card_settings','savings_transfers'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy family_read on public.%I for select to authenticated using(public.is_member(household_id))',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('create trigger family_revision after insert or update or delete on public.%I for each row execute function public.bump_family_revision()',tab);
 end loop;
end $$;

create function public.save_card_settings(p_household uuid,p_amount numeric,p_date date,p_version integer) returns void
language plpgsql security definer set search_path='' as $$ declare old public.card_settings; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 select * into old from public.card_settings where household_id=p_household;
 if p_version is null or coalesce(old.version,0)<>p_version then raise exception 'Остаток уже изменён. Обновите данные'; end if;
 insert into public.card_settings values(p_household,p_amount,p_date,1)
 on conflict(household_id) do update set opening_amount=excluded.opening_amount,opening_on=excluded.opening_on,version=public.card_settings.version+1;
end $$;

create function public.save_goal(p_household uuid,p_id uuid,p_version integer,p_name text,p_target numeric,p_deadline date,p_monthly numeric,p_archived boolean default false) returns void
language plpgsql security definer set search_path='' as $$ declare old public.financial_goals; g public.financial_goals; d date:=(now() at time zone 'Asia/Yekaterinburg')::date; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 select * into old from public.financial_goals where id=p_id;
 if found and old.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
 if p_version is null or coalesce(old.version,0)<>p_version then
  if p_version=0 and old.name=trim(p_name) and old.target_amount=p_target and old.deadline=p_deadline and old.monthly_amount=p_monthly and old.archived=p_archived then return; end if;
  raise exception 'Цель уже изменена. Обновите данные';
 end if;
 if p_id is null or p_name is null or p_archived is null then raise exception 'Проверьте цель'; end if;
 insert into public.financial_goals(id,household_id,name,target_amount,deadline,monthly_amount,archived)
 values(p_id,p_household,trim(p_name),p_target,p_deadline,p_monthly,p_archived)
 on conflict(id) do update set name=excluded.name,target_amount=excluded.target_amount,deadline=excluded.deadline,monthly_amount=excluded.monthly_amount,archived=excluded.archived,version=public.financial_goals.version+1 returning * into g;
 insert into public.goal_versions(household_id,goal_id,effective_on,value) values(p_household,g.id,d,to_jsonb(g));
 if p_archived and not coalesce(old.archived,false) then
  insert into public.savings_goal_links(household_id,account_id,goal_id,effective_on)
  select p_household,a.id,null,d from public.savings_accounts a
  cross join lateral(select goal_id from public.savings_goal_links where account_id=a.id order by effective_on desc,id desc limit 1) l
  where a.household_id=p_household and l.goal_id=p_id;
  -- Invalidate open account editors, including editors opened by the other member.
  update public.savings_accounts set version=version+1 where household_id=p_household;
 end if;
end $$;

-- Account settings and its goal link change in a single transaction.
create function public.save_goal_account(p_household uuid,p_id uuid,p_name text,p_version integer,p_rate numeric,p_start date,p_frequency text,p_goal uuid) returns void
language plpgsql security definer set search_path='' as $$ declare old_goal uuid; d date:=(now() at time zone 'Asia/Yekaterinburg')::date; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if p_goal is not null and not exists(select 1 from public.financial_goals where id=p_goal and household_id=p_household and not archived) then raise exception 'Цель недоступна'; end if;
 select goal_id into old_goal from public.savings_goal_links where account_id=p_id order by effective_on desc,id desc limit 1;
 if p_version=0 and exists(select 1 from public.savings_accounts where id=p_id) and old_goal is distinct from p_goal then
  raise exception 'Счёт уже изменён. Обновите данные';
 end if;
 perform public.save_savings_account(p_household,p_id,p_name,p_version,p_rate,p_start,p_frequency);
 if old_goal is distinct from p_goal then
  insert into public.savings_goal_links(household_id,account_id,goal_id,effective_on) values(p_household,p_id,p_goal,d);
 end if;
end $$;

create function public.assign_savings_goal() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if TG_OP='INSERT' or new.account_id is distinct from old.account_id or new.occurred_on is distinct from old.occurred_on then
  new.goal_id:=(select l.goal_id from public.savings_goal_links l where l.account_id=new.account_id and l.effective_on<=new.occurred_on order by l.effective_on desc,l.id desc limit 1);
 end if;
 return new;
end $$;
revoke all on function public.assign_savings_goal() from public,anon,authenticated;
create trigger savings_goal before insert or update on public.savings_entries for each row execute function public.assign_savings_goal();

alter function public.save_savings(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) rename to save_savings_v081;
revoke all on function public.save_savings_v081(uuid,uuid,integer,text,numeric,date,text,boolean,uuid) from public,anon,authenticated;
create function public.save_savings(p_household uuid,p_id uuid,p_version integer,p_kind text,p_amount numeric,p_date date,p_comment text,p_delete boolean default false,p_account uuid default null) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 if exists(select 1 from public.savings_entries where id=p_id and transfer_id is not null) then raise exception 'Измените перевод между счетами целиком'; end if;
 perform public.save_savings_v081(p_household,p_id,p_version,p_kind,p_amount,p_date,p_comment,p_delete,p_account);
end $$;

create function public.save_savings_transfer(p_household uuid,p_id uuid,p_version integer,p_from uuid,p_to uuid,p_amount numeric,p_date date,p_comment text,p_delete boolean default false) returns void
language plpgsql security definer set search_path='' as $$ declare old public.savings_transfers; t public.savings_transfers; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 select * into old from public.savings_transfers where id=p_id;
 if found and old.household_id<>p_household then raise exception 'Доступ запрещён'; end if;
 if p_version is null or p_version<0 or p_delete is null then raise exception 'Проверьте версию'; end if;
 if old.id is null and p_delete then return; end if;
 if coalesce(old.version,0)<>p_version then
  if p_version=0 and old.user_id=auth.uid() and old.from_account=p_from and old.to_account=p_to and old.amount=p_amount and old.occurred_on=p_date and old.comment is not distinct from nullif(trim(p_comment),'') and not p_delete then return; end if;
  raise exception 'Перевод уже изменён. Обновите данные';
 end if;
 if p_delete then
  delete from public.savings_entries where transfer_id=p_id;
  delete from public.savings_transfers where id=p_id;
 else
  if not exists(select 1 from public.savings_accounts where id=p_from and household_id=p_household) or not exists(select 1 from public.savings_accounts where id=p_to and household_id=p_household) then raise exception 'Счёт недоступен'; end if;
  insert into public.savings_transfers(id,household_id,from_account,to_account,amount,occurred_on,comment,user_id,debit_id,credit_id)
  values(p_id,p_household,p_from,p_to,p_amount,p_date,nullif(trim(p_comment),''),auth.uid(),gen_random_uuid(),gen_random_uuid())
  on conflict(id) do update set from_account=excluded.from_account,to_account=excluded.to_account,amount=excluded.amount,occurred_on=excluded.occurred_on,comment=excluded.comment,version=public.savings_transfers.version+1 returning * into t;
  insert into public.savings_entries(id,household_id,account_id,kind,amount,occurred_on,comment,user_id,updated_by,transfer_id)
  values(t.debit_id,p_household,p_from,'withdrawal',p_amount,p_date,t.comment,t.user_id,auth.uid(),p_id),
        (t.credit_id,p_household,p_to,'deposit',p_amount,p_date,t.comment,t.user_id,auth.uid(),p_id)
  on conflict(id) do update set account_id=excluded.account_id,amount=excluded.amount,occurred_on=excluded.occurred_on,comment=excluded.comment,updated_by=auth.uid(),version=public.savings_entries.version+1;
 end if;
 perform public.check_savings_balances(p_household);
end $$;

alter function public.save_transaction(uuid,uuid,integer,uuid,text,numeric,date,text) rename to save_transaction_v081;
revoke all on function public.save_transaction_v081(uuid,uuid,integer,uuid,text,numeric,date,text) from public,anon,authenticated;
create function public.save_transaction(p_household uuid,p_id uuid,p_version integer,p_category uuid,p_kind text,p_amount numeric,p_date date,p_comment text,p_goal uuid default null) returns public.transactions
language plpgsql security definer set search_path='' as $$ declare t public.transactions; old public.transactions; begin
 if not public.is_member(p_household) then raise exception 'Доступ к семье закрыт'; end if;
 perform 1 from public.households where id=p_household for update;
 select * into old from public.transactions where id=p_id;
 if p_goal is not null and (p_kind<>'expense' or not exists(select 1 from public.financial_goals where id=p_goal and household_id=p_household and (not archived or old.goal_id=p_goal))) then raise exception 'Выберите доступную цель для расхода'; end if;
 if old.id is not null and p_version=0 and old.goal_id is distinct from p_goal then raise exception 'Операция уже изменена'; end if;
 t:=public.save_transaction_v081(p_household,p_id,p_version,p_category,p_kind,p_amount,p_date,p_comment);
 if t.goal_id is distinct from p_goal then update public.transactions set goal_id=p_goal where id=p_id returning * into t; end if;
 return t;
end $$;

-- Atomic, RLS-scoped read of actuals and planning data.
alter function public.budget_snapshot(date) rename to budget_snapshot_v081;
create function public.budget_snapshot(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
 return result;
end $$;

create function public.capture_goal_baseline(p_household uuid,p_id uuid,p_version integer,p_required numeric,p_balance numeric) returns void
language plpgsql security definer set search_path='' as $$ declare g public.financial_goals; begin
 if not public.is_member(p_household) then raise exception 'Доступ запрещён'; end if;
 perform 1 from public.households where id=p_household for update;
 select * into g from public.financial_goals where id=p_id and household_id=p_household and not archived;
 if not found or g.version<>p_version then raise exception 'Цель уже изменена. Обновите данные'; end if;
 if g.baseline is not null then return; end if;
 if p_required is null or p_balance is null or p_required<0 or p_balance<0 or p_required>=1000000000000 or p_balance>=1000000000000 then raise exception 'Проверьте суммы'; end if;
 update public.financial_goals set baseline=jsonb_build_object('captured_on',(now() at time zone 'Asia/Yekaterinburg')::date,'target_amount',g.target_amount,'deadline',g.deadline,'monthly_amount',g.monthly_amount,'required_amount',p_required,'balance_amount',p_balance),version=version+1 where id=p_id;
 insert into public.goal_versions(household_id,goal_id,effective_on,value) select household_id,id,(now() at time zone 'Asia/Yekaterinburg')::date,to_jsonb(financial_goals) from public.financial_goals where id=p_id;
end $$;

do $$ declare fn regprocedure; begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_card_settings','save_goal','save_goal_account','save_savings','save_savings_transfer','save_transaction','budget_snapshot','capture_goal_baseline') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
commit;
