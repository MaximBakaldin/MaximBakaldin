-- Public clients may only read rows permitted by RLS; RPCs handle all writes.
revoke all on table public.households, public.members, public.categories, public.transactions, public.budgets, public.family_invites from public, anon, authenticated;
grant select on table public.households, public.members, public.categories, public.transactions, public.budgets to authenticated;
