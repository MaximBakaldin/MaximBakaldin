import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "../src/types";
let db: PGlite,
  family: string,
  other: string,
  cat: string,
  inc: string,
  a: string,
  b: string,
  day: string,
  month: string;
const user = "00000000-0000-0000-0000-000000000001",
  stranger = "00000000-0000-0000-0000-000000000002";
async function as(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function v<T = string>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const snap = () =>
  v<Snapshot>("select public.budget_snapshot($1) as v", [month + "-01"]);
const movement = (
  account: string,
  kind: string,
  amount: number,
  date = day,
  id = randomUUID(),
  version = 0,
  remove = false,
) =>
  v("select public.save_savings($1,$2,$3,$4,$5,$6,null,$7,$8) as v", [
    family,
    id,
    version,
    kind,
    amount,
    date,
    remove,
    account,
  ]);
const goalSave = (id: string, version = 0, archived = false) =>
  v("select public.save_goal($1,$2,$3,$4,300000,$5,10000,$6) as v", [
    family,
    id,
    version,
    "Подушка",
    month + "-28",
    archived,
  ]);
const bind = (account: string, goal: string | null, version = 1) =>
  v(
    "select public.save_goal_account($1,$2,$3,$4,null,null,'monthly',$5) as v",
    [family, account, account === a ? "A" : "B", version, goal],
  );
const transfer = (
  id: string,
  version: number,
  amount: number,
  remove = false,
) =>
  v("select public.save_savings_transfer($1,$2,$3,$4,$5,$6,$7,null,$8) as v", [
    family,
    id,
    version,
    a,
    b,
    amount,
    day,
    remove,
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant all on tables to anon,authenticated;`,
  );
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  day = await v(
    "select (now() at time zone 'Asia/Yekaterinburg')::date::text as v",
  );
  month = day.slice(0, 7);
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("reset role;truncate auth.users cascade");
  await db.query("insert into auth.users values($1),($2)", [user, stranger]);
  await as(stranger);
  other = await v("select public.create_family('Другая') as v");
  await as(user);
  family = await v("select public.create_family('Наша') as v");
  cat = await v("select id as v from public.categories where name='Продукты'");
  inc = await v(
    "select id as v from public.categories where kind='income' limit 1",
  );
  a = randomUUID();
  b = randomUUID();
  for (const [id, name] of [
    [a, "A"],
    [b, "B"],
  ])
    await v("select public.save_savings_account($1,$2,$3,0) as v", [
      family,
      id,
      name,
    ]);
});
it("переносит остаток, не считает старые операции и обязательства; перевод и покупка различаются", async () => {
  const before = await v<string>("select ($1::date-1)::text as v", [day]);
  await v(
    "select public.save_transaction($1,$2,0,$3,'income',999,$4,null) as v",
    [family, randomUUID(), inc, before],
  );
  await v("select public.save_card_settings($1,150000,$2,0) as v", [
    family,
    day,
  ]);
  await movement(a, "deposit", 100000);
  await movement(a, "withdrawal", 80000);
  expect((await snap()).cards?.balance_cents).toBe("13000000");
  await v(
    "select public.save_transaction($1,$2,0,$3,'expense',30000,$4,null) as v",
    [family, randomUUID(), cat, day],
  );
  expect((await snap()).cards?.balance_cents).toBe("10000000");
  const next = await v<string>(
    "select ($1::date+interval '1 month')::date::text as v",
    [month + "-01"],
  );
  expect(
    (await v<Snapshot>("select public.budget_snapshot($1) as v", [next])).cards
      ?.balance_cents,
  ).toBe("10000000");
  await expect(
    v("select public.save_card_settings($1,1,$2,0) as v", [family, day]),
  ).rejects.toThrow("уже изменён");
});
it("смена цели не переписывает привязку существующего движения; удаление сохраняет деньги и историю", async () => {
  const g = randomUUID(),
    h = randomUUID(),
    entry = randomUUID();
  await goalSave(g);
  await goalSave(h);
  await bind(a, g);
  await movement(a, "deposit", 100, day, entry);
  await bind(a, h, 2);
  expect(
    await v("select goal_id as v from public.savings_entries where id=$1", [
      entry,
    ]),
  ).toBe(g);
  await movement(a, "deposit", 110, day, entry, 1);
  expect(
    await v("select goal_id as v from public.savings_entries where id=$1", [
      entry,
    ]),
  ).toBe(g);
  expect(
    (await snap()).savings?.accounts?.find((x) => x.id === a)?.goal_id,
  ).toBe(h);
  await goalSave(h, 1, true);
  expect(
    (await snap()).savings?.accounts?.find((x) => x.id === a)?.goal_id,
  ).toBeNull();
  expect((await snap()).savings?.balance_cents).toBe("11000");
  expect(
    await v("select goal_id as v from public.savings_entries where id=$1", [
      entry,
    ]),
  ).toBe(g);
});
it("перевод атомарный, повтор не создаёт дубль, обе стороны редактируются вместе", async () => {
  await v("select public.save_card_settings($1,0,$2,0) as v", [family, day]);
  await movement(a, "opening", 1000);
  const id = randomUUID();
  await transfer(id, 0, 800);
  await transfer(id, 0, 800);
  expect((await snap()).cards?.balance_cents).toBe("0");
  expect((await snap()).savings?.transfer_cents).toBe("0");
  const debit = await v(
    "select debit_id as v from public.savings_transfers where id=$1",
    [id],
  );
  await expect(movement(a, "withdrawal", 1, day, debit, 1)).rejects.toThrow(
    "целиком",
  );
  await transfer(id, 1, 700);
  expect(
    (await snap()).savings?.accounts?.find((x) => x.id === a)?.balance_cents,
  ).toBe("30000");
  await expect(transfer(id, 2, 1100)).rejects.toThrow("недостаточно");
  expect(
    (await snap()).savings?.accounts?.find((x) => x.id === a)?.balance_cents,
  ).toBe("30000");
  await transfer(id, 2, 700, true);
  expect((await snap()).savings?.balance_cents).toBe("100000");
});
it("расход на цель не дублируется; изменение и удаление пересчитывает выполненную часть", async () => {
  const g = randomUUID(),
    id = randomUUID();
  await goalSave(g);
  await v(
    "select public.save_transaction($1,$2,0,$3,'expense',500,$4,null,$5) as v",
    [family, id, cat, day, g],
  );
  expect((await snap()).goals?.find((x) => x.id === g)?.paid_cents).toBe(
    "50000",
  );
  await v(
    "select public.save_transaction($1,$2,1,$3,'expense',300,$4,null,$5) as v",
    [family, id, cat, day, g],
  );
  expect((await snap()).goals?.find((x) => x.id === g)?.paid_cents).toBe(
    "30000",
  );
  await v("select public.delete_transaction($1,2) as v", [id]);
  expect((await snap()).goals?.find((x) => x.id === g)?.paid_cents).toBe("0");
});
it("изолирует цели, привязки, переводы и настройки между семьями и запрещает прямые записи", async () => {
  const g = randomUUID();
  await goalSave(g);
  await bind(a, g);
  await as(stranger);
  for (const table of [
    "financial_goals",
    "goal_versions",
    "savings_goal_links",
    "card_settings",
    "savings_transfers",
  ])
    expect(
      await v<number>(`select count(*)::int as v from public.${table}`),
    ).toBe(0);
  await expect(goalSave(g, 1)).rejects.toThrow("Доступ");
  await expect(bind(b, g)).rejects.toThrow("Доступ");
  await expect(
    v("select public.save_card_settings($1,1,$2,0) as v", [family, day]),
  ).rejects.toThrow("Доступ");
  await expect(
    v(
      "select public.save_goal_account($1,$2,'X',0,null,null,'monthly',$3) as v",
      [other, randomUUID(), g],
    ),
  ).rejects.toThrow("Цель недоступна");
  await db.exec("reset role;set role anon");
  await expect(
    v("select public.save_card_settings($1,1,$2,0) as v", [family, day]),
  ).rejects.toThrow("permission denied");
  await as(user);
  await expect(
    db.exec("update public.financial_goals set name='X'"),
  ).rejects.toThrow("permission denied");
});
it("сохраняет исходный план при изменении цели", async () => {
  const g = randomUUID();
  await goalSave(g);
  await v("select public.capture_goal_baseline($1,$2,1,20000,100000) as v", [
    family,
    g,
  ]);
  await goalSave(g, 2);
  expect(
    (await snap()).goals?.find((x) => x.id === g)?.baseline?.required_amount,
  ).toBe(20000);
});
it("даёт второму участнику общие цели и остаток; отклоняет устаревшие редакторы", async () => {
  const spouse = randomUUID(),
    g = randomUUID();
  await goalSave(g);
  await bind(a, g);
  await v("select public.save_card_settings($1,1000,$2,0) as v", [family, day]);
  await db.exec("reset role");
  await db.query("insert into auth.users values($1)", [spouse]);
  await db.query(
    "insert into public.members(household_id,user_id) values($1,$2)",
    [family, spouse],
  );
  await as(spouse);
  expect((await snap()).goals?.[0].id).toBe(g);
  expect((await snap()).cards?.balance_cents).toBe("100000");
  await goalSave(g, 1, true);
  expect(
    (await snap()).savings?.accounts?.find((x) => x.id === a)?.goal_id,
  ).toBeNull();
  await as(user);
  await expect(goalSave(g, 1)).rejects.toThrow("уже изменена");
  await expect(bind(a, null, 2)).rejects.toThrow("уже изменён");
});
it("считает изменение остатка с процентами, отрицательным фактом и переводом между целями", async () => {
  const g = randomUUID(),
    h = randomUUID();
  await goalSave(g);
  await goalSave(h);
  await bind(a, g);
  await bind(b, g);
  const start = month + "-01",
    prior = await v<string>("select ($1::date-1)::text as v", [start]);
  // Simulate a binding made before the measured month, without changing the machine clock.
  await db.exec("reset role");
  await db.query(
    "update public.savings_goal_links set effective_on=$1 where household_id=$2",
    [prior, family],
  );
  await as(user);
  await movement(a, "opening", 100000, prior);
  await v(
    "select public.save_goal_account($1,$2,'A',2,36.5,$3,'daily',$4) as v",
    [family, a, start, g],
  );
  await movement(a, "deposit", 20000);
  const s = await snap(),
    interest = Number(
      s.savings?.accounts?.find((x) => x.id === a)?.interest_cents ?? 0,
    );
  expect(Number(s.goals?.find((x) => x.id === g)?.contribution_cents)).toBe(
    2000000 + interest,
  );
  await movement(a, "withdrawal", 40000);
  expect(
    Number((await snap()).goals?.find((x) => x.id === g)?.contribution_cents),
  ).toBe(-2000000 + interest);
  await transfer(randomUUID(), 0, 10000);
  expect(
    Number((await snap()).goals?.find((x) => x.id === g)?.contribution_cents),
  ).toBe(-2000000 + interest);
  await bind(b, h, 2);
  expect(
    (await snap()).goals?.find((x) => x.id === h)?.contribution_cents,
  ).toBe("0");
  await transfer(randomUUID(), 0, 5000);
  const final = await snap();
  expect(Number(final.goals?.find((x) => x.id === g)?.contribution_cents)).toBe(
    -2500000 + interest,
  );
  expect(final.goals?.find((x) => x.id === h)?.contribution_cents).toBe(
    "500000",
  );
});
