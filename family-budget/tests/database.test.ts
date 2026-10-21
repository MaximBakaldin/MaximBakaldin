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
    const initialRevision = await value<number>(
      "select revision::int as v from public.households where id=$1",
      [family],
    );
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
    expect(snap.revision).toBe(initialRevision + 10002);
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

const RULE = "20000000-0000-0000-0000-000000000001";
const SAVING = "30000000-0000-0000-0000-000000000001";
const WITHDRAW = "30000000-0000-0000-0000-000000000002";
async function recurring(
  version = 0,
  month = "2026-10-01",
  amount = "1500.10",
  active = true,
) {
  await value(
    "select public.save_recurring($1,$2,$3,$4,'Ипотека',$5,$6,31,$7) as v",
    [family, RULE, version, month, category, amount, active],
  );
}
async function snap(month = "2026-10-01") {
  return value<import("../src/types").Snapshot>(
    "select public.budget_snapshot($1) as v",
    [month],
  );
}
async function pay(version = 1, month = "2026-10-01", date = "2026-10-21") {
  return value<import("../src/types").Transaction>(
    "select to_jsonb(public.pay_recurring($1,$2,$3,$4,$5)) as v",
    [family, RULE, month, version, date],
  );
}
async function savings(
  id = SAVING,
  version = 0,
  kind = "deposit",
  amount = "500.25",
  date = "2026-10-01",
  remove = false,
) {
  await value("select public.save_savings($1,$2,$3,$4,$5,$6,null,$7) as v", [
    family,
    id,
    version,
    kind,
    amount,
    date,
    remove,
  ]);
}
describe("Настройки и категории", () => {
  it("название меняет владелец с защитой от устаревшего ввода", async () => {
    await as(B);
    await expect(
      value("select public.rename_family($1,'Новое',1) as v", [family]),
    ).rejects.toThrow("Только владелец");
    await as(A);
    await value("select public.rename_family($1,'Новая семья',1) as v", [
      family,
    ]);
    expect((await snap()).family.name).toBe("Новая семья");
    await expect(
      value("select public.rename_family($1,'Потерянное',1) as v", [family]),
    ).rejects.toThrow("уже изменено");
  });
  it("удаление категории сохраняет историю, запрещает новые операции и допускает исправление старой", async () => {
    await save();
    await value(
      "select public.save_category($1,$2,'Еда','expense',true,1) as v",
      [family, category],
    );
    expect((await snap()).summary[0].cents).toBe("10010");
    await expect(save(0, "15", "2026-10-21", RULE)).rejects.toThrow(
      "Некорректная категория",
    );
    await save(1, "120");
    expect(
      (await snap()).categories.find((c) => c.id === category),
    ).toMatchObject({ name: "Еда", archived: true, version: 2 });
    await value(
      "select public.save_category($1,$2,'Еда','expense',false,2) as v",
      [family, category],
    );
    await save(0, "15", "2026-10-21", RULE);
  });
  it("категорию активного платежа нельзя скрыть, но после отключения можно", async () => {
    await recurring();
    await expect(
      value("select public.save_category($1,$2,'Еда','expense',true,1) as v", [
        family,
        category,
      ]),
    ).rejects.toThrow("обязательных платежах");
    await recurring(1, "2026-11-01", "1500.10", false);
    await value(
      "select public.save_category($1,$2,'Еда','expense',true,1) as v",
      [family, category],
    );
  });
});
describe("Обязательные платежи", () => {
  it("двое участников оплачивают один месяц без дублей, новый месяц начинается неоплаченным", async () => {
    await recurring();
    const first = await pay();
    await as(B);
    expect((await pay()).id).toBe(first.id);
    expect((await snap()).summary[0].cents).toBe("150010");
    expect((await snap("2026-11-01")).recurring?.[0].payment).toBeNull();
    const next = await pay(1, "2026-11-01", "2026-11-30");
    expect(next.id).not.toBe(first.id);
    expect((await snap("2026-11-01")).summary[0].cents).toBe("150010");
  });
  it("изменения шаблона с нового месяца не меняют прошлые суммы", async () => {
    await recurring();
    await recurring(1, "2026-11-01", "2000.50");
    expect((await snap()).recurring?.[0].amount).toBe(1500.1);
    expect((await snap("2026-11-01")).recurring?.[0].amount).toBe(2000.5);
    await expect(pay(1)).rejects.toThrow("уже изменён");
    const paid = await pay(2);
    await recurring(2, "2026-10-01", "900");
    expect((await snap()).recurring?.[0].payment?.amount).toBe(paid.amount);
    expect((await snap("2026-11-01")).recurring?.[0].amount).toBe(2000.5);
  });
  it("оплату можно исправить, отменить и внести снова", async () => {
    await recurring();
    const paid = await pay();
    await save(1, "1700", "2026-10-22", paid.id);
    expect((await snap()).recurring?.[0].payment?.amount).toBe(1700);
    await expect(save(2, "1700", "2026-11-01", paid.id)).rejects.toThrow(
      "своём месяце",
    );
    await value("select public.delete_transaction($1,2) as v", [paid.id]);
    expect((await snap()).recurring?.[0].payment).toBeNull();
    expect((await snap()).summary).toEqual([]);
    await pay();
    expect((await snap()).summary[0].cents).toBe("150010");
  });
  it("отключение не стирает оплаты и предыдущие месяцы", async () => {
    await recurring();
    await pay();
    await recurring(1, "2026-10-01", "1500.10", false);
    expect((await snap()).recurring?.[0].payment).not.toBeNull();
    await expect(pay(2, "2026-11-01", "2026-11-30")).rejects.toThrow(
      "отключён",
    );
  });
  it("нельзя привязать чужую категорию или оплатить чужой шаблон", async () => {
    await recurring();
    await as(C);
    await expect(pay()).rejects.toThrow("Доступ запрещён");
    await expect(
      value(
        "select public.save_recurring($1,$2,0,'2026-10-01','X',$3,5,1,true) as v",
        [otherFamily, SAVING, category],
      ),
    ).rejects.toThrow("активную категорию");
    expect((await snap()).recurring).toEqual([]);
  });
});
describe("Накопления", () => {
  it("остаток и переводы считаются отдельно от доходов и расходов", async () => {
    await savings(SAVING, 0, "opening", "1000", "2026-09-01");
    await savings(WITHDRAW, 0, "deposit", "500.25", "2026-10-02");
    const s = await snap();
    expect(s.savings).toMatchObject({
      balance_cents: "150025",
      transfer_cents: "50025",
      has_opening: true,
    });
    expect(s.summary).toEqual([]);
    expect((await snap("2026-09-01")).savings).toMatchObject({
      balance_cents: "100000",
      transfer_cents: "0",
    });
    await savings(RULE, 0, "withdrawal", "100", "2026-10-03");
    expect((await snap()).savings?.balance_cents).toBe("140025");
  });
  it("защищает остаток, включая операции задним числом и удаление пополнения", async () => {
    await savings();
    await expect(savings(WITHDRAW, 0, "withdrawal", "600")).rejects.toThrow(
      "недостаточно",
    );
    await expect(
      savings(WITHDRAW, 0, "withdrawal", "100", "2026-09-30"),
    ).rejects.toThrow("недостаточно");
    await savings(WITHDRAW, 0, "withdrawal", "400", "2026-10-02");
    await expect(
      savings(SAVING, 1, "deposit", "500.25", "2026-10-01", true),
    ).rejects.toThrow("недостаточно");
    await expect(savings(SAVING, 1, "deposit", "300")).rejects.toThrow(
      "недостаточно",
    );
    expect((await snap()).savings?.balance_cents).toBe("10025");
  });
  it("повтор перевода не создаёт дубль, чужая семья и устаревшая версия отклоняются", async () => {
    await savings();
    await savings();
    expect((await snap()).savings?.entries).toHaveLength(1);
    await as(B);
    await savings(SAVING, 1, "deposit", "700");
    await expect(savings(SAVING, 1, "deposit", "800")).rejects.toThrow(
      "уже изменён",
    );
    await as(C);
    await expect(savings()).rejects.toThrow("Доступ запрещён");
    expect((await snap()).savings?.balance_cents).toBe("0");
  });
  it("новые таблицы закрыты для прямой записи и анонимного чтения", async () => {
    for (const table of [
      "recurring_rules",
      "recurring_terms",
      "savings_entries",
      "savings_accounts",
    ]) {
      for (const role of ["anon", "authenticated"])
        expect(
          await value<boolean>(
            "select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE') as v",
            [role, `public.${table}`],
          ),
        ).toBe(false);
      expect(
        await value<boolean>(
          "select has_table_privilege('anon',$1,'SELECT') as v",
          [`public.${table}`],
        ),
      ).toBe(false);
    }
    await db.exec("reset role; set role anon");
    await expect(savings()).rejects.toThrow("permission denied");
    await expect(recurring()).rejects.toThrow("permission denied");
  });
});

const ACCOUNT = "40000000-0000-0000-0000-000000000001";
async function account(name = "Отпуск", version = 0, id = ACCOUNT) {
  return value("select public.save_savings_account($1,$2,$3,$4) as v", [
    family,
    id,
    name,
    version,
  ]);
}
async function onAccount(
  id: string,
  kind: string,
  amount: string,
  accountId = ACCOUNT,
  version = 0,
  date = "2026-10-01",
) {
  return value(
    "select public.save_savings($1,$2,$3,$4,$5,$6,null,false,$7) as v",
    [family, id, version, kind, amount, date, accountId],
  );
}
describe("Несколько накопительных счетов", () => {
  it("сохраняет отдельные остатки и общий итог; один счёт не покрывает снятие с другого", async () => {
    await savings(SAVING, 0, "opening", "1000");
    await account();
    await expect(onAccount(WITHDRAW, "withdrawal", "1")).rejects.toThrow(
      "недостаточно",
    );
    await onAccount(WITHDRAW, "opening", "200");
    await onAccount(RULE, "deposit", "25");
    const s = (await snap()).savings!;
    expect(s.balance_cents).toBe("122500");
    expect(s.transfer_cents).toBe("2500");
    expect(s.accounts!.find((a) => a.id === ACCOUNT)).toMatchObject({
      balance_cents: "22500",
      has_opening: true,
    });
    expect(
      s.accounts!.reduce((sum, a) => sum + Number(a.balance_cents), 0),
    ).toBe(Number(s.balance_cents));
    await expect(onAccount(ID, "opening", "1")).rejects.toThrow("уже задан");
  });
  it("проверяет названия, версии и семейный доступ", async () => {
    await account();
    await account();
    await as(B);
    await account("Поездки", 1);
    await expect(account("Устарело", 1)).rejects.toThrow("уже изменён");
    await expect(account("поездки", 0, ID)).rejects.toThrow("уже есть");
    await as(C);
    expect(
      await value<number>(
        "select count(*)::int as v from public.savings_accounts",
      ),
    ).toBe(0);
    await expect(account()).rejects.toThrow("Доступ запрещён");
    await expect(
      value(
        "select public.save_savings($1,$2,0,'deposit',1,'2026-10-01',null,false,$3) as v",
        [otherFamily, ID, ACCOUNT],
      ),
    ).rejects.toThrow("Счёт не найден");
    await expect(
      value("select public.save_savings_account($1,$2,'Чужой',0) as v", [
        otherFamily,
        ACCOUNT,
      ]),
    ).rejects.toThrow("Доступ запрещён");
  });
  it("перенос движения между счетами не оставляет отрицательный остаток", async () => {
    await savings();
    await savings(WITHDRAW, 0, "withdrawal", "400", "2026-10-02");
    await account();
    await expect(
      onAccount(SAVING, "deposit", "500.25", ACCOUNT, 1),
    ).rejects.toThrow("недостаточно");
    await savings(WITHDRAW, 1, "withdrawal", "400", "2026-10-02", true);
    await onAccount(SAVING, "deposit", "500.25", ACCOUNT, 1);
    expect(
      (await snap()).savings!.accounts!.find((a) => a.id === ACCOUNT)
        ?.balance_cents,
    ).toBe("50025");
  });
});

describe("Проценты по накоплениям", () => {
  async function settings(
    rate: string,
    frequency = "monthly",
    start = "2025-01-01",
    version = 0,
  ) {
    await value(
      "select public.save_savings_account($1,$2,'Вклад',$3,$4,$5,$6) as v",
      [family, ACCOUNT, version, rate, start, frequency],
    );
  }
  async function credits(until: string) {
    return (
      await db.query<{ amount: string; occurred_on: string }>(
        "select amount::text,occurred_on::text from public.savings_calculated_entries($1,$2) where kind='interest' order by occurred_on",
        [ACCOUNT, until],
      )
    ).rows;
  }
  it("начисляет в конце месяца, капитализирует и совпадает с локальным расчётом", async () => {
    await settings("36.5");
    await onAccount(SAVING, "opening", "100000", ACCOUNT, 0, "2025-01-01");
    expect(await credits("2025-01-30")).toEqual([]);
    const rows = await credits("2025-02-28");
    expect(rows.map((r) => Number(r.amount))).toEqual([3100, 2886.8]);
    const s = await snap("2025-02-01");
    expect(s.savings?.accounts?.find((a) => a.id === ACCOUNT)).toMatchObject({
      balance_cents: "10598680",
      interest_cents: "288680",
      transfer_cents: "0",
    });
    expect(s.summary).toEqual([]);
    const { calculatedSavings } = await import("../src/lib/interest");
    const entries = calculatedSavings(
      [
        {
          id: SAVING,
          account_id: ACCOUNT,
          household_id: family,
          kind: "opening",
          amount: "100000",
          occurred_on: "2025-01-01",
          comment: null,
          user_id: A,
          updated_by: A,
          version: 1,
        },
      ],
      {
        id: ACCOUNT,
        annual_rate: 36.5,
        interest_start: "2025-01-01",
        interest_frequency: "monthly",
      },
      "2025-02-28",
    );
    expect(
      entries.filter((e) => e.kind === "interest").map((e) => Number(e.amount)),
    ).toEqual(rows.map((r) => Number(r.amount)));
    expect((await snap("2025-02-01")).revision).toBe(s.revision);
    expect(await credits("2025-02-28")).toEqual(rows);
  });
  it("учитывает остаток каждого дня, исправления и високосный год", async () => {
    await settings("36.5");
    await onAccount(SAVING, "opening", "100000", ACCOUNT, 0, "2025-01-01");
    await onAccount(WITHDRAW, "withdrawal", "50000", ACCOUNT, 0, "2025-01-16");
    await onAccount(RULE, "deposit", "10000", ACCOUNT, 0, "2025-01-21");
    expect(Number((await credits("2025-01-31"))[0].amount)).toBe(2410);
    await onAccount(RULE, "deposit", "20000", ACCOUNT, 1, "2025-01-21");
    expect(Number((await credits("2025-01-31"))[0].amount)).toBe(2520);
    await settings("36.6", "daily", "2024-02-01", 1);
    // Move the existing opening rather than create a second opening balance.
    await onAccount(SAVING, "opening", "100000", ACCOUNT, 1, "2024-02-01");
    expect((await credits("2024-02-02")).map((r) => Number(r.amount))).toEqual([
      100, 100.1,
    ]);
  });
  it("позволяет снять начисленные проценты, защищает от отрицательного остатка при смене ставки", async () => {
    await settings("36.5");
    await onAccount(SAVING, "opening", "100000", ACCOUNT, 0, "2025-01-01");
    await onAccount(WITHDRAW, "withdrawal", "103100", ACCOUNT, 0, "2025-02-01");
    expect(
      (await snap("2025-02-01")).savings?.accounts?.find(
        (a) => a.id === ACCOUNT,
      )?.balance_cents,
    ).toBe("0");
    await expect(settings("0", "monthly", "2025-01-01", 1)).rejects.toThrow(
      "недостаточно",
    );
    await account("Новое название", 1);
    expect(
      (await snap("2025-02-01")).savings?.accounts?.find(
        (a) => a.id === ACCOUNT,
      )?.annual_rate,
    ).toBe(36.5);
  });
  it("не начисляет за текущий день или будущее, закрывает чужие счета и проверяет ставку", async () => {
    const day = await value<string>(
      "select (now() at time zone 'Asia/Yekaterinburg')::date::text as v",
    );
    await settings("36.5", "daily", day);
    await onAccount(SAVING, "opening", "100000", ACCOUNT, 0, day);
    expect(await credits("9998-12-31")).toEqual([]);
    await expect(settings("-2", "daily", day, 1)).rejects.toThrow(
      "Проверьте ставку",
    );
    await as(C);
    expect(await credits("9998-12-31")).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(credits("2025-01-31")).rejects.toThrow("permission denied");
  });
});

it("популярность считает операции обоих участников без доступа другой семьи и anon", async () => {
  await save();
  await as(B);
  await save(0, "1", "2025-01-01", "10000000-0000-0000-0000-000000000002");
  const counts = await db.query<{ category_id: string; uses: number }>(
    "select * from public.popular_categories($1)",
    [family],
  );
  expect(counts.rows.map((r) => ({ ...r, uses: Number(r.uses) }))).toEqual([
    { category_id: category, uses: 2 },
  ]);
  await as(C);
  expect(
    (await db.query("select * from public.popular_categories($1)", [family]))
      .rows,
  ).toEqual([]);
  await db.exec("reset role; set role anon");
  await expect(
    db.query("select * from public.popular_categories($1)", [family]),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  await db.query("update public.categories set archived=true where id=$1", [
    category,
  ]);
  await as(A);
  expect(
    (await db.query("select * from public.popular_categories($1)", [family]))
      .rows,
  ).toEqual([]);
});
