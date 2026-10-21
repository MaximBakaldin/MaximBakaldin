import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function buildServiceWorker(directory = "dist") {
  const html = await readFile(`${directory}/index.html`, "utf8");
  const base = html.match(/href="([^"<>]*)manifest\.webmanifest"/)?.[1];
  if (!base || !/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(base))
    throw new Error("Manifest must use an absolute deployment base path");
  const relative = [
    "index.html",
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png",
    ...(await readdir(`${directory}/assets`)).map((file) => `assets/${file}`),
  ];
  const hash = createHash("sha256");
  for (const file of relative) {
    hash.update(file);
    hash.update(await readFile(`${directory}/${file}`));
  }
  const prefix = `family-budget:${base}:`;
  const assets = relative.map((file) => base + file);
  const source = `const BASE=${JSON.stringify(base)};
const PREFIX=${JSON.stringify(prefix)};
const CACHE=PREFIX+${JSON.stringify(hash.digest("hex").slice(0, 12))};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match(BASE+'index.html'))));return;
  }
  if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
`;
  await writeFile(`${directory}/sw.js`, source);
  await writeFile(`${directory}/.nojekyll`, "");
  return { base, assets, source };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await buildServiceWorker();
