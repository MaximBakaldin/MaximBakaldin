import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const ID = "10000000-0000-0000-0000-000000000001";
let db: PGlite;
let family: string;
let category: string;
let otherFamily: string;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function value<T = string>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  const r = await db.query<{ v: T }>(sql, args);
  return r.rows[0]?.v;
}
async function save(
  version = 0,
  amount = "100.10",
  date = "2026-10-21",
  id = ID,
) {
  return value<{ user_id: string; updated_by: string; version: number }>(
    "select to_jsonb(public.save_transaction($1,$2,$3,$4,'expense',$5,$6,'Продукты')) as v",
    [family, id, version, category, amount, date],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon, authenticated;",
  );
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role; truncate auth.users cascade;");
  await db.query("insert into auth.users values ($1),($2),($3)", [A, B, C]);
  await as(A);
  family = await value("select public.create_family($1) as v", ["Семья A"]);
  category = await value(
    "select id as v from public.categories where name='Продукты'",
  );
  const invite = await value<{ code: string }>(
    "select public.rotate_invite($1) as v",
    [family],
  );
  await as(B);
  await value("select public.join_family($1) as v", [invite.code]);
  await as(C);
  otherFamily = await value("select public.create_family($1) as v", [
    "Семья C",
  ]);
  await as(A);
});
describe("Семья и доступ", () => {
  it("создание семьи безопасно при повторе", async () => {
    expect(
      await value("select public.create_family($1) as v", ["Повтор"]),
    ).toBe(family);
    expect(
      await value<number>("select count(*)::int as v from public.members"),
    ).toBe(2);
  });
  it("вторая семья не видит данные первой и не может писать через RPC", async () => {
    await save();
    await as(C);
    expect(
      await value<number>("select count(*)::int as v from public.transactions"),
    ).toBe(0);
    await expect(save(1)).rejects.toThrow("Доступ к семье закрыт");
    const snapshot = await value<{ family: { id: string } }>(
      "select public.budget_snapshot($1) as v",
      ["2026-10-01"],
    );
    expect(snapshot.family.id).toBe(otherFamily);
  });
  it("нельзя обойти проверки прямой записью в таблицу", async () => {
    await save();
    await expect(
      db.query("update public.transactions set amount=1 where id=$1", [ID]),
    ).rejects.toThrow(/permission denied/);
  });
  it("приглашения доступны только владельцу, отзываются и истекают", async () => {
    await as(B);
    await expect(
      value("select public.rotate_invite($1) as v", [family]),
    ).rejects.toThrow("Только владелец");
    await as(A);
    const invite = await value<{ code: string }>(
      "select public.rotate_invite($1) as v",
      [family],
    );
    await value("select public.remove_member($1,$2) as v", [family, B]);
    await as(B);
    await expect(
      value("select public.join_family($1) as v", [invite.code]),
    ).rejects.toThrow("Код недействителен");
    expect(
      await value("select public.budget_snapshot($1) as v", ["2026-10-01"]),
    ).toBeNull();
    await as(A);
    const next = await value<{ code: string }>(
      "select public.rotate_invite($1) as v",
      [family],
    );
    await db.exec(
      "reset role; update public.family_invites set expires_at=now()-interval '1 minute'",
    );
    await as(B);
    await expect(
      value("select public.join_family($1) as v", [next.code]),
    ).rejects.toThrow("Код недействителен");
  });
  it("одноразовое приглашение нельзя использовать после вступления", async () => {
    await value("select public.remove_member($1,$2) as v", [family, B]);
    const invite = await value<{ code: string }>(
      "select public.rotate_invite($1) as v",
      [family],
    );
    await as(B);
    await value("select public.join_family($1) as v", [invite.code]);
    await db.exec("reset role");
    expect(
      await value<number>(
        "select count(*)::int as v from public.family_invites",
      ),
    ).toBe(0);
  });
  it("анонимный пользователь не может вызывать RPC", async () => {
    await db.exec("reset role; set role anon");
    await expect(
      value("select public.create_family($1) as v", ["X"]),
    ).rejects.toThrow("permission denied");
  });
});
describe("Операции", () => {
  it("сохраняет автора и отклоняет устаревшую версию", async () => {
    await save();
    await as(B);
    const row = await save(1, "200.20");
    expect(row).toMatchObject({ user_id: A, updated_by: B, version: 2 });
    await as(A);
    await expect(save(1, "300")).rejects.toThrow("Операция уже изменена");
    await expect(
      value("select public.delete_transaction($1,1) as v", [ID]),
    ).rejects.toThrow("Операция уже изменена");
  });
  it("повтор сохранения после потерянного ответа не создаёт дубль", async () => {
    await save();
    await save();
    expect(
      await value<number>("select count(*)::int as v from public.transactions"),
    ).toBe(1);
    await expect(save(0, "200")).rejects.toThrow("Операция уже изменена");
  });
  it.each(["0", "-1", "1.001", "1000000000000"])(
    "не принимает некорректную сумму %s",
    async (amount) => {
      await expect(save(0, amount)).rejects.toThrow("Некорректная сумма");
    },
  );
  it("запрещает категорию другой семьи и неправильного типа", async () => {
    await as(C);
    const cat = await value<string>(
      "select id as v from public.categories where name='Продукты'",
    );
    await as(A);
    await expect(
      value(
        "select public.save_transaction($1,$2,0,$3,'expense',1,'2026-10-21',null) as v",
        [family, ID, cat],
      ),
    ).rejects.toThrow("Некорректная категория");
    await expect(
      value(
        "select public.save_transaction($1,$2,0,$3,'income',1,'2026-10-21',null) as v",
        [family, ID, category],
      ),
    ).rejects.toThrow("Некорректная категория");
  });
  it("итоги полны при 10001 операциях и ограничены месяцем", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.transactions(household_id,user_id,category_id,kind,amount,occurred_on,updated_by) select $1,$2,$3,'expense',0.01,'2026-10-21',$2 from generate_series(1,10001)",
      [family, A, category],
    );
    await as(A);
    await save(0, "200", "2026-09-30");
    const snap = await value<{
      summary: { cents: string }[];
      revision: number;
    }>("select public.budget_snapshot($1) as v", ["2026-10-01"]);
    expect(snap.summary[0].cents).toBe("10001");
    expect(snap.revision).toBe(10002);
  });
});
describe("План", () => {
  it("конфликты не перезаписывают чужой план, копирование сохраняет текущие суммы", async () => {
    await value(
      "select public.save_budget($1,$2,'2026-09-01',1500.15,0) as v",
      [family, category],
    );
    expect(
      await value("select public.copy_budget($1,'2026-10-01') as v", [family]),
    ).toBe(1);
    expect(
      await value("select public.copy_budget($1,'2026-10-01') as v", [family]),
    ).toBe(0);
    await as(B);
    await value("select public.save_budget($1,$2,'2026-10-01',2000,1) as v", [
      family,
      category,
    ]);
    await as(A);
    await expect(
      value("select public.save_budget($1,$2,'2026-10-01',3000,1) as v", [
        family,
        category,
      ]),
    ).rejects.toThrow("План уже изменён");
    expect(
      await value(
        "select amount::text as v from public.budgets where month='2026-10-01'",
      ),
    ).toBe("2000.00");
  });
});

it("отзывает TRUNCATE и другие прямые права, унаследованные от Supabase", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const privilege of [
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "TRIGGER",
      "REFERENCES",
    ]) {
      expect(
        await value<boolean>("select has_table_privilege($1, $2, $3) as v", [
          role,
          "public.transactions",
          privilege,
        ]),
      ).toBe(false);
    }
  }
  expect(
    await value<boolean>(
      "select has_table_privilege('anon','public.transactions','SELECT') as v",
    ),
  ).toBe(false);
  expect(
    await value<boolean>(
      "select has_table_privilege('authenticated','public.transactions','SELECT') as v",
    ),
  ).toBe(true);
});
