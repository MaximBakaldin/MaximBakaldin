import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("обновляет исходную базу, сохраняя операции, планы и автора", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
    );
    await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
    const user = "00000000-0000-0000-0000-000000000001";
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    const family = (
      await db.query<{ id: string }>(
        "select public.create_family('Семья до обновления') as id",
      )
    ).rows[0].id;
    const category = (
      await db.query<{ id: string }>(
        "select id from public.categories where name='Продукты'",
      )
    ).rows[0].id;
    await db.query(
      "insert into public.transactions(household_id,user_id,category_id,kind,amount,occurred_on,comment) values($1,$2,$3,'expense',100.10,'2026-10-01','До миграции')",
      [family, user, category],
    );
    await db.query(
      "insert into public.budgets(household_id,category_id,month,amount) values($1,$2,'2026-10-01',2500.50)",
      [family, category],
    );
    await db.exec(
      readFileSync("supabase/migrations/002_shared_budget.sql", "utf8"),
    );
    await db.exec("set role authenticated");
    const row = (
      await db.query<{
        amount: string;
        user_id: string;
        updated_by: string;
        version: number;
        comment: string;
      }>(
        "select amount::text,user_id,updated_by,version,comment from public.transactions",
      )
    ).rows[0];
    expect(row).toEqual({
      amount: "100.10",
      user_id: user,
      updated_by: user,
      version: 1,
      comment: "До миграции",
    });
    const plan = (
      await db.query<{ amount: string; version: number }>(
        "select amount::text,version from public.budgets",
      )
    ).rows[0];
    expect(plan).toEqual({ amount: "2500.50", version: 1 });
    const result = (
      await db.query<{ snapshot: { summary: { cents: string }[] } }>(
        "select public.budget_snapshot('2026-10-01') as snapshot",
      )
    ).rows[0].snapshot;
    expect(result.summary[0].cents).toBe("10010");
  } finally {
    await db.close();
  }
});
