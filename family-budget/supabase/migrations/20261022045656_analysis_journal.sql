-- Scalar JSON results preserve complete totals beyond the REST row limit.
create function public.budget_analysis(p_household uuid, p_from date default null, p_to date default null, p_daily boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (p_from is not null and p_to is not null and p_from>p_to) or p_daily is null then raise exception 'Некорректный период'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.period,x.category_id),'[]'::jsonb) from (
  select case when p_daily then t.occurred_on else date_trunc('month',t.occurred_on)::date end as period,
   t.category_id,t.kind,(sum(t.amount)*100)::numeric(30,0)::text as cents
  from public.transactions t where t.household_id=p_household
   and (p_from is null or t.occurred_on>=p_from) and (p_to is null or t.occurred_on<=p_to)
  group by 1,t.category_id,t.kind
 ) x);
end $$;
revoke all on function public.budget_analysis(uuid,date,date,boolean) from public,anon;
grant execute on function public.budget_analysis(uuid,date,date,boolean) to authenticated;

create function public.budget_journal(p_household uuid,p_from date,p_to date,p_end_exclusive boolean default false,p_category uuid default null,p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_from is null or p_to is null or p_from>p_to or p_offset is null or p_offset<0 or p_end_exclusive is null then raise exception 'Некорректный период или страница'; end if;
 return (with entries as (
   select t.id,t.occurred_on,'transaction'::text as source,t.category_id,t.comment,to_jsonb(t)||jsonb_build_object('source','transaction') as item
   from public.transactions t where t.household_id=p_household
   union all
   select s.id,s.occurred_on,'savings',null::uuid,s.comment,to_jsonb(s)||jsonb_build_object('source','savings','account_name',a.name)
   from public.savings_entries s join public.savings_accounts a on a.id=s.account_id and a.household_id=s.household_id
   where s.household_id=p_household
 ), filtered as (
   select * from entries where occurred_on>=p_from and (case when p_end_exclusive then occurred_on<p_to else occurred_on<=p_to end)
    and (p_category is null or category_id=p_category)
    and (coalesce(p_search,'')='' or position(lower(p_search) in lower(coalesce(comment,'')))>0)
 ), page as (
   select * from filtered order by occurred_on desc,id desc,source desc limit 30 offset p_offset
 ) select jsonb_build_object('count',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(item order by occurred_on desc,id desc,source desc) from page),'[]'::jsonb)));
end $$;
revoke all on function public.budget_journal(uuid,date,date,boolean,uuid,text,integer) from public,anon;
grant execute on function public.budget_journal(uuid,date,date,boolean,uuid,text,integer) to authenticated;
