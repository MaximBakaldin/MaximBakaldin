-- Read-only aggregation; the caller's membership policies remain in force.
create function public.popular_categories(p_household uuid)
returns table(category_id uuid, uses bigint)
language sql stable security invoker set search_path = '' as $$
  select t.category_id, count(*) as uses
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.household_id = t.household_id
  where t.household_id = p_household and not c.archived
  group by t.category_id;
$$;
revoke all on function public.popular_categories(uuid) from public, anon;
grant execute on function public.popular_categories(uuid) to authenticated;
