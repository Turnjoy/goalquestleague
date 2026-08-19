import { existsSync, readFileSync } from 'node:fs';

function readDotEnv() {
  if (!existsSync('.env')) return {};

  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const localEnv = readDotEnv();
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !(process.env[key] || localEnv[key]));

if (missing.length > 0) {
  console.error(`Missing required build environment variable(s): ${missing.join(', ')}`);
  console.error('Set them in Cloudflare Pages > Settings > Environment variables > Production, then redeploy.');
  process.exit(1);
}
