# Slides

A minimal slideshow builder and viewer, deployed on Netlify.

## Features

- **Builder** — paste image/video URLs to create slides, drag to reorder, autosave, share links, export to PDF or PPTX
- **Viewer** — fullscreen presentation with keyboard and click navigation, multiple layout modes
- **Sharing** — generates a read-only link with a unique token; recipients can view but not edit
- **Export** — PDF and PPTX generated client-side at 2× resolution; videos are included as thumbnail + URL in notes

## Layout modes

Each slide can be set to one of five layouts:

| Mode | Behaviour |
|------|-----------|
| Smart | Picks columns based on image orientation (default) |
| Cover | Fixed grid, images cropped to fill cells |
| Contain | Fixed grid, full image visible with black bars |
| Mosaic | Single row, widths proportional to aspect ratio |
| Free flow | Flex wrap, images keep natural size |

## Stack

- Vanilla JS + HTML/CSS frontend (no framework)
- Netlify Functions (ESM) for the API
- Netlify Blobs for storage (`slideshows` and `shares` stores)

## Deploy

Push to `main` — Netlify builds and deploys automatically.

```toml
# netlify.toml
publish = "public"
functions = "netlify/functions"
node_bundler = "esbuild"
```

## Local development

```bash
npm install
netlify dev
```

Requires the [Netlify CLI](https://docs.netlify.com/cli/get-started/) and a linked site for Blobs access.
