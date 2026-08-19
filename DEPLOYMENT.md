# GoalQuest League Cloudflare Pages Deployment

Use Cloudflare Pages as a static site host only.

## Build Settings

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: project root

The repository also includes `wrangler.toml` with:

```toml
pages_build_output_dir = "./dist"
```

## Required Environment Variables

Set these in Cloudflare Pages > Settings > Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Blank Page Check

If the deployed HTML contains this script, Cloudflare is serving the source folder and the page will be blank:

```html
<script type="module" src="/src/main.jsx"></script>
```

The deployed HTML must instead reference built assets from `/assets/`.
