import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  revision: 1,
  offsets: [] as number[],
  rows: Array.from({ length: 5 }, (_, i) => ({ id: String(i) })),
}));
vi.mock("../src/db", () => ({
  client: () => ({
    rpc: async () => ({
      data: { family: { id: "family" }, revision: mock.revision },
      error: null,
    }),
    from: () => {
      let offset = 0;
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        ilike: () => query,
        range: (start: number) => {
          offset = start;
          mock.offsets.push(start);
          return query;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: mock.rows.slice(offset, offset + 2),
            count: mock.rows.length,
            error: null,
          }).then(resolve),
      };
      return query;
    },
  }),
}));
import { exportHistory } from "../src/lib/api";
beforeEach(() => {
  mock.offsets = [];
  mock.revision = 1;
});
describe("Полная выгрузка", () => {
  it("продолжает выгрузку при серверном лимите меньше размера страницы", async () => {
    const result = await exportHistory("family", "2026-10", 1);
    expect(result.length).toBe(5);
    expect(mock.offsets).toEqual([0, 2, 4]);
  });
  it("не выдаёт смешанную выгрузку при параллельном изменении данных", async () => {
    mock.revision = 2;
    await expect(exportHistory("family", "2026-10", 1)).rejects.toThrow(
      "Данные изменились",
    );
  });
});
