import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { buildServiceWorker } from "../scripts/build-service-worker.mjs";
import { validateDeployEnv } from "../scripts/validate-deploy-env.mjs";
import { appUrl } from "../src/lib/urls";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture(base: string) {
  const dir = await mkdtemp(join(tmpdir(), "budget-pwa-"));
  dirs.push(dir);
  await mkdir(join(dir, "assets"));
  await writeFile(
    join(dir, "index.html"),
    `<link rel="manifest" href="${base}manifest.webmanifest">`,
  );
  for (const file of [
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png",
    "assets/app.js",
  ])
    await writeFile(join(dir, file), "fixture");
  return dir;
}
describe("PWA on GitHub Pages", () => {
  it.each(["/", "/MaximBakaldin/"])(
    "scopes assets and auth callbacks to %s",
    async (base) => {
      const result = await buildServiceWorker(await fixture(base));
      expect(result.base).toBe(base);
      expect(result.assets.every((path: string) => path.startsWith(base))).toBe(
        true,
      );
      expect(appUrl("https://maximbakaldin.github.io", base)).toBe(
        "https://maximbakaldin.github.io" + base,
      );
      const manifest = JSON.parse(
        await readFile("public/manifest.webmanifest", "utf8"),
      );
      expect(
        new URL(
          manifest.start_url,
          `https://example.com${base}manifest.webmanifest`,
        ).pathname,
      ).toBe(base);
      for (const icon of manifest.icons)
        expect(
          new URL(icon.src, `https://example.com${base}manifest.webmanifest`)
            .pathname,
        ).toMatch(new RegExp(`^${base}`));
    },
  );
  it("leaves other applications caches and network traffic alone", async () => {
    const { source } = await buildServiceWorker(
      await fixture("/MaximBakaldin/"),
    );
    const listeners: Record<string, (event: unknown) => void> = {};
    const deleted: string[] = [];
    vm.runInNewContext(source, {
      URL,
      self: {
        location: { origin: "https://example.com" },
        addEventListener: (name: string, handler: (event: unknown) => void) => {
          listeners[name] = handler;
        },
      },
      caches: {
        keys: async () => [
          "family-budget:/other/:old",
          "unrelated-cache",
          "family-budget:/MaximBakaldin/:old",
        ],
        delete: async (key: string) => {
          deleted.push(key);
        },
      },
      fetch: () => {
        throw new Error("Unexpected network request");
      },
    });
    let pending: Promise<unknown> | undefined;
    listeners.activate({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(deleted).toEqual(["family-budget:/MaximBakaldin/:old"]);
    for (const url of [
      "https://api.supabase.co/rest/v1/transactions",
      "https://example.com/other/page",
    ])
      listeners.fetch({
        request: { url, method: "GET", mode: "navigate" },
        respondWith: () => {
          throw new Error("Intercepted another application");
        },
      });
  });
  it("changes cache version when icons change", async () => {
    const dir = await fixture("/");
    const a = await buildServiceWorker(dir);
    await writeFile(join(dir, "icon-192.png"), "new-icon");
    const b = await buildServiceWorker(dir);
    expect(a.source).not.toBe(b.source);
  });
});
describe("Deployment config", () => {
  it("rejects empty configuration and server keys without printing them", () => {
    expect(() => validateDeployEnv({})).toThrow("repository variables");
    expect(() =>
      validateDeployEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_secret_TEST",
      }),
    ).toThrow("public publishable");
    const serviceToken =
      "header." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString(
        "base64url",
      ) +
      ".signature";
    expect(() =>
      validateDeployEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: serviceToken,
      }),
    ).toThrow("public publishable");
    expect(() =>
      validateDeployEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_TEST",
      }),
    ).not.toThrow();
  });
});
