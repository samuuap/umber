/**
 * Da el rol admin a uno o más usuarios, por nombre de usuario. Lo guarda en
 * `app_metadata` de `auth.users`, que nadie puede cambiar desde su propia
 * cuenta: solo la Admin API (decisión de la Fase 8, panel de administración,
 * ver `docs/fase-8-experto-general.md`).
 *
 *   node scripts/set-admin.mjs samuuap samuuaos
 *
 * Usa el Data API y la Admin API con la secret key de `.env.local`.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const SECRET = env.SUPABASE_SECRET_KEY;
const BASE = env.SUPABASE_URL;

const usernames = process.argv.slice(2);
if (usernames.length === 0) {
  console.error('Uso: node scripts/set-admin.mjs <usuario> [usuario...]');
  process.exit(1);
}

async function call(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${await response.text()}`);
  return response.json();
}

for (const username of usernames) {
  const profiles = await call(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`);
  if (profiles.length === 0) {
    console.warn(`✗ ${username}: no existe ese nombre de usuario`);
    continue;
  }
  const { id } = profiles[0];
  await call(`/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ app_metadata: { role: 'admin' } }),
  });
  console.log(`✓ ${username} (${id}) → admin`);
}
