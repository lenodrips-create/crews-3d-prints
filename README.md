# Crews 3D Prints

The website for Crews 3D Prints — small-batch 3D-printed dragons, crab pen holders, floppy dudes and a Halloween duck, $5 each in eight filaments.

It's a static site: plain HTML, CSS and JavaScript, no build step. The animations are [HyperFrames](https://hyperframes.heygen.com) compositions played live on the page with `<hyperframes-player>`.

## Run it

Any static file server works. From the repo root:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk won't work — the page uses JavaScript modules, which browsers only load over HTTP.

To publish it, turn on **GitHub Pages** for this repo (Settings → Pages → deploy from the `main` branch, root folder). Netlify, Vercel or Cloudflare Pages also work with no configuration.

## Before going live

- **Order email.** Orders and custom requests are sent by email. Set `SHOP_EMAIL` at the top of `assets/js/main.js`. While it's empty, "Send order" and "Send request" copy the order text to the customer's clipboard instead of opening their mail app.
- **Share image.** `og:image` in `index.html` is a relative path. Some sites want a full URL there — swap in your domain once you have one.

## What's where

```
index.html               the page
assets/css/style.css     all styling (colours and fonts are CSS variables at the top)
assets/js/main.js        products, bag, filament picker, spin wheel, form, player control
assets/js/art.js         the product illustrations, drawn as SVG in any filament colour
assets/vendor/           the HyperFrames player (@hyperframes/player 0.8.113)
assets/fonts/            Archivo, Inter Tight, JetBrains Mono (all OFL)
motion/hero/             HyperFrames project: the vase print timelapse in the hero
motion/process/          HyperFrames project: model → slice → print → ship, scrubbed by scroll
motion/renders/          both compositions rendered to MP4, for social posts
```

### Editing products

The four prints live in the `PRODUCTS` list in `assets/js/main.js` (name, description, price, badge). Their drawings are in `assets/js/art.js`; filament colours are the `FILAMENTS` list in the same file.

## The animations

Each folder under `motion/` is its own HyperFrames project (HyperFrames allows one root composition per project). Both draw on a `<canvas>` with `assets/slicer.js`, a small renderer that builds a part ring by ring and shades it like a slicer preview. The two projects each carry a copy of `slicer.js`; if you change one, copy it to the other.

The page drives them differently:

- **Hero** plays on a loop while it's on screen and pauses when it isn't. With reduced motion turned on, it shows a still of the finished vase.
- **Process** never plays on its own. Scrolling through the section seeks it, so the scroll position is the playhead.

Preview, check and render with the HyperFrames CLI (Node 22+ and FFmpeg):

```bash
cd motion/hero            # or motion/process
npx hyperframes@0.8.113 preview     # live studio in the browser
npx hyperframes@0.8.113 check       # lint, layout, motion and contrast checks
npx hyperframes@0.8.113 render -q high -o ../renders/hero.mp4
```

After changing a composition, refresh the poster frames in `assets/img/` (`hero-poster.jpg`, `process-poster.jpg`) so the page shows the right still while the player loads — `npx hyperframes snapshot --at 7` gives you a PNG to start from.
