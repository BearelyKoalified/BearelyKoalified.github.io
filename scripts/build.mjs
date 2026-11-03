// Builds dist/: finds every repo with GitHub Pages turned on, adds the extra apps
// listed in apps.json, screenshots each one in light and dark, and renders index.html.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const config = JSON.parse(await readFile(new URL('apps.json', root), 'utf8'));
const user = config.user;
const hubRepo = `${user}.github.io`.toLowerCase();

async function gh(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'apps-hub' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status}`);
  return res.json();
}

async function discoverPagesRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/users/${user}/repos?per_page=100&page=${page}&sort=pushed`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter(r => r.has_pages && !r.fork && !r.private)
    .filter(r => r.name.toLowerCase() !== hubRepo && !config.exclude.includes(r.name))
    .map(r => ({
      slug: r.name,
      url: `https://${user.toLowerCase()}.github.io/${r.name}/`,
      description: r.description ?? '',
      repo: r.html_url,
      updated: r.pushed_at,
      host: 'GitHub Pages',
      screenshot: true,
    }));
}

const apps = [...(await discoverPagesRepos()), ...config.extra.map(a => ({ screenshot: true, ...a }))]
  .map(a => ({ ...a, ...config.overrides[a.slug] }));

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('thumbs/', dist), { recursive: true });

// 1280x800 at 0.6x gives 768x480 JPEGs: sharp enough for a ~380px card on a 2x screen.
const browser = await chromium.launch();
for (const app of apps) {
  app.thumbs = {};
  if (!app.screenshot) continue;
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.6, colorScheme: scheme,
    });
    const page = await context.newPage();
    try {
      await page.goto(app.url, { waitUntil: 'load', timeout: 45_000 });
      // Maps keep streaming tiles, so networkidle may never come; cap the wait.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
      app.title ??= (await page.title()).trim() || app.slug;
      const file = `thumbs/${app.slug}-${scheme}.jpg`;
      await page.screenshot({ path: fileURLToPath(new URL(file, dist)), type: 'jpeg', quality: 78 });
      app.thumbs[scheme] = file;
    } catch (err) {
      console.warn(`! ${app.slug} (${scheme}): ${err.message.split('\n')[0]}`);
    }
    await context.close();
  }
  console.log(`${app.thumbs.light ? '✓' : '·'} ${app.slug} — ${app.title ?? ''}`);
}
await browser.close();

for (const app of apps) app.title ??= app.slug;
apps.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

const card = a => `
  <li class="card" data-search="${esc(`${a.title} ${a.description} ${a.host}`.toLowerCase())}">
    <a class="shot" href="${esc(a.url)}" aria-label="Open ${esc(a.title)}">
      ${a.thumbs.light
        ? `<picture>
        ${a.thumbs.dark ? `<source srcset="${a.thumbs.dark}" media="(prefers-color-scheme: dark)">` : ''}
        <img src="${a.thumbs.light}" alt="" width="768" height="480" loading="lazy" decoding="async">
      </picture>`
        : `<span class="placeholder"><span class="mono">${esc(new URL(a.url).host)}</span>${a.note ? `<span>${esc(a.note)}</span>` : ''}</span>`}
    </a>
    <div class="body">
      <h2><a href="${esc(a.url)}">${esc(a.title)}</a></h2>
      ${a.description ? `<p>${esc(a.description)}</p>` : ''}
      <div class="meta">
        <span class="host">${esc(a.host)}</span>
        ${a.updated ? `<time datetime="${a.updated}">Updated ${day(a.updated)}</time>` : ''}
        ${a.repo ? `<a class="src" href="${esc(a.repo)}">Source</a>` : ''}
      </div>
    </div>
  </li>`;

const builtAt = new Date().toISOString();
const template = await readFile(new URL('src/index.html', root), 'utf8');
const html = template
  .replaceAll('{{USER}}', esc(user))
  .replace('{{COUNT}}', String(apps.length))
  .replace('{{BUILT_ISO}}', builtAt)
  .replace('{{BUILT}}', day(builtAt))
  .replace('{{CARDS}}', apps.map(card).join(''));

await writeFile(new URL('index.html', dist), html);
await writeFile(new URL('apps.json', dist), JSON.stringify({ builtAt, apps }, null, 2));
await writeFile(new URL('.nojekyll', dist), '');
console.log(`Built ${apps.length} apps into dist/`);
