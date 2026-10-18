import { art, FILAMENTS } from "./art.js";

// Where orders and custom requests go. Leave empty and the site copies the
// order text for the customer to send you instead of opening their mail app.
const SHOP_EMAIL = "";

const PRODUCTS = [
  {
    id: "dragon",
    name: "Articulated Dragon",
    blurb: "Articulated spine, 214 layers. Wiggles like the real thing.",
    price: 5,
    badge: "In stock",
  },
  {
    id: "crab",
    name: "Crab Pen Holder",
    blurb: "Claw grips six pens. Weighted base, no wobble.",
    price: 5,
    badge: "Best seller",
  },
  {
    id: "floppy",
    name: "Floppy Dude",
    blurb: "This guy is super floppy.",
    price: 5,
    badge: "New",
  },
  {
    id: "duck",
    name: "Halloween Duck",
    blurb: "Special edition. Jack-o'-lantern duck with a pumpkin stem and carved eyes.",
    price: 5,
    badge: "October only",
    hot: true,
  },
];

const VIP = { id: "vip", name: "VIP membership", price: 20 };
const SPIN_KEY = "crews:last-spin";
const BAG_KEY = "crews:bag";
const DAY = 24 * 60 * 60 * 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const filament = (id) => FILAMENTS.find((f) => f.id === id) || FILAMENTS[4];
const money = (n) => `$${n}`;

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: the bag just won't survive a reload */
    }
  },
};

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
}

/* Product cards ------------------------------------------------------------- */

const selected = new Map(PRODUCTS.map((p) => [p.id, "orange"]));

function swatchMarkup(productId, current) {
  return FILAMENTS.map(
    (f) => `
      <button type="button" role="radio" class="swatch${f.hex ? "" : " swatch--mystery"}"
        style="--c:${f.hex || "transparent"}" data-product="${productId}" data-filament="${f.id}"
        aria-checked="${f.id === current}" aria-label="${f.name}" title="${f.name}"></button>`,
  ).join("");
}

function renderProducts() {
  const grid = $("#product-grid");
  grid.innerHTML = PRODUCTS.map((p, i) => {
    const f = filament(selected.get(p.id));
    return `
      <article class="card reveal" data-product="${p.id}" style="transition-delay:${i * 70}ms">
        <div class="card-art">
          <span class="badge${p.hot ? " badge--hot" : ""}">${p.badge}</span>
          <span class="card-no">No. ${String(i + 1).padStart(2, "0")}</span>
          <div class="art art-current">${art(p.id, f)}</div>
          <div class="nozzle-line"></div>
        </div>
        <div class="card-body">
          <div class="card-title"><h3>${p.name}</h3><span class="price">${money(p.price)}</span></div>
          <p>${p.blurb}</p>
          <div class="filament-row">
            <span class="filament-label">Filament — <b>${f.name}</b></span>
            <div class="swatches" role="radiogroup" aria-label="${p.name} filament">${swatchMarkup(p.id, f.id)}</div>
          </div>
          <button class="btn btn-ink" type="button" data-add="${p.id}">Add to bag — ${money(p.price)}</button>
        </div>
      </article>`;
  }).join("");
}

// Re-print the illustration in a new filament: the new colour builds up from the
// bed in visible layers while a nozzle line rides the edge.
function reprint(productId, filamentId, delay = 0) {
  const card = $(`.card[data-product="${productId}"]`);
  if (!card) return;
  const f = filament(filamentId);
  selected.set(productId, filamentId);
  card.querySelector(".filament-label b").textContent = f.name;
  card
    .querySelectorAll(".swatch")
    .forEach((s) => s.setAttribute("aria-checked", String(s.dataset.filament === filamentId)));

  const holder = card.querySelector(".card-art");
  const current = holder.querySelector(".art-current");
  holder.querySelectorAll(".art-next").forEach((n) => n.remove());
  const next = document.createElement("div");
  next.className = "art art-next";
  next.innerHTML = art(productId, f);
  holder.insertBefore(next, holder.querySelector(".nozzle-line"));

  const finish = () => {
    current.innerHTML = next.innerHTML;
    next.remove();
  };
  if (reduceMotion.matches || !next.animate) {
    finish();
    return;
  }
  const duration = 900;
  const steps = 16;
  next
    .animate([{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)" }], {
      duration,
      delay,
      easing: `steps(${steps}, end)`,
      fill: "forwards",
    })
    .finished.then(finish, () => {});
  const nozzle = holder.querySelector(".nozzle-line");
  nozzle.animate(
    [
      { top: "94%", opacity: 1 },
      { top: "6%", opacity: 1, offset: 0.97 },
      { top: "6%", opacity: 0 },
    ],
    { duration, delay, easing: `steps(${steps}, end)` },
  );
}

function bindProducts() {
  $("#product-grid").addEventListener("click", (e) => {
    const swatch = e.target.closest(".swatch");
    if (swatch) {
      if (selected.get(swatch.dataset.product) !== swatch.dataset.filament) {
        reprint(swatch.dataset.product, swatch.dataset.filament);
      }
      return;
    }
    const add = e.target.closest("[data-add]");
    if (add) {
      const p = PRODUCTS.find((x) => x.id === add.dataset.add);
      addToBag({ id: p.id, filament: selected.get(p.id) });
      toast(`Added ${p.name} — ${filament(selected.get(p.id)).name}`);
    }
  });
}

/* Filament spools ------------------------------------------------------------- */

function spoolSvg(f) {
  const fill = f.hex || "url(#spool-mix)";
  const winding = Array.from({ length: 6 }, (_, i) => `<circle cx="60" cy="60" r="${26 + i * 4.4}" />`).join("");
  return `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      ${
        f.hex
          ? ""
          : `<defs><linearGradient id="spool-mix" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ff5b1f"/><stop offset=".35" stop-color="#f2c200"/>
              <stop offset=".65" stop-color="#3fae4d"/><stop offset="1" stop-color="#1668e3"/></linearGradient></defs>`
      }
      <circle cx="60" cy="60" r="58" fill="#16110d"/>
      <circle cx="60" cy="60" r="52" fill="${fill}"/>
      <g fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.2">${winding}</g>
      <circle cx="60" cy="60" r="22" fill="#16110d"/>
      <circle cx="60" cy="60" r="9" fill="#f4f1ec"/>
      <circle cx="60" cy="44" r="3.4" fill="#f4f1ec"/>
      <circle cx="73.9" cy="68" r="3.4" fill="#f4f1ec"/>
      <circle cx="46.1" cy="68" r="3.4" fill="#f4f1ec"/>
    </svg>`;
}

function renderSpools() {
  $("#spools").innerHTML = FILAMENTS.map(
    (f) => `
      <button class="spool reveal" type="button" role="radio" aria-checked="false" data-filament="${f.id}">
        ${spoolSvg(f)}
        <span class="spool-name">${f.name}</span>
        <span class="spool-meta">${f.hex ? `PLA · ${f.hex}` : "We pick it"}</span>
      </button>`,
  ).join("");
  $("#spools").addEventListener("click", (e) => {
    const spool = e.target.closest(".spool");
    if (!spool) return;
    const id = spool.dataset.filament;
    document.querySelectorAll(".spool").forEach((s) => s.setAttribute("aria-checked", String(s === spool)));
    PRODUCTS.forEach((p, i) => reprint(p.id, id, i * 90));
    toast(`Every print is now ${filament(id).name.toLowerCase()}`);
  });
}

/* Bag ----------------------------------------------------------------------- */

let bag = store.get(BAG_KEY, []);

function itemInfo(item) {
  if (item.id === VIP.id) return { name: VIP.name, price: VIP.price, color: null };
  const p = PRODUCTS.find((x) => x.id === item.id);
  return { name: p.name, price: p.price, color: filament(item.filament) };
}

function addToBag(item) {
  const hit = bag.find((x) => x.id === item.id && x.filament === item.filament);
  if (hit) hit.qty += 1;
  else bag.push({ ...item, qty: 1 });
  saveBag();
  const count = $("#bag-count");
  count.classList.remove("bump");
  void count.offsetWidth;
  count.classList.add("bump");
}

function saveBag() {
  bag = bag.filter((x) => x.qty > 0);
  store.set(BAG_KEY, bag);
  renderBag();
}

function bagTotal() {
  return bag.reduce((sum, x) => sum + itemInfo(x).price * x.qty, 0);
}

function renderBag() {
  const count = bag.reduce((n, x) => n + x.qty, 0);
  $("#bag-count").textContent = count;
  $("#bag-total").textContent = money(bagTotal());
  $("#checkout").disabled = count === 0;
  const list = $("#bag-items");
  if (!count) {
    list.innerHTML = `<li class="bag-empty">Nothing here yet. Go pick a print.</li>`;
    return;
  }
  list.innerHTML = bag
    .map((x, i) => {
      const info = itemInfo(x);
      const thumb = info.color
        ? `<div class="bag-thumb">${art(x.id, info.color)}</div>`
        : `<div class="bag-thumb bag-thumb--vip">VIP</div>`;
      const meta = info.color
        ? `<small><i style="--c:${info.color.hex || "#888"}"></i>${info.color.name}</small>`
        : `<small>Members only</small>`;
      return `
        <li class="bag-item">
          ${thumb}
          <div>
            <h3>${info.name}</h3>
            ${meta}
            <div class="qty">
              <button type="button" data-qty="-1" data-index="${i}" aria-label="One fewer ${info.name}">−</button>
              <span>${x.qty}</span>
              <button type="button" data-qty="1" data-index="${i}" aria-label="One more ${info.name}">+</button>
            </div>
          </div>
          <span class="line-price">${money(info.price * x.qty)}</span>
        </li>`;
    })
    .join("");
}

let lastFocus = null;
function openBag() {
  lastFocus = document.activeElement;
  const bagEl = $("#bag");
  const scrim = $("#scrim");
  bagEl.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => {
    bagEl.classList.add("is-open");
    scrim.classList.add("is-open");
  });
  $("#bag-close").focus();
}
function closeBag() {
  const bagEl = $("#bag");
  const scrim = $("#scrim");
  bagEl.classList.remove("is-open");
  scrim.classList.remove("is-open");
  setTimeout(() => {
    bagEl.hidden = true;
    scrim.hidden = true;
  }, 450);
  if (lastFocus) lastFocus.focus();
}

function orderText() {
  const lines = bag.map((x) => {
    const info = itemInfo(x);
    return `${x.qty} × ${info.name}${info.color ? ` (${info.color.name})` : ""} — ${money(info.price * x.qty)}`;
  });
  return `Hi Crews 3D Prints! I'd like to order:\n\n${lines.join("\n")}\n\nTotal: ${money(bagTotal())}`;
}

async function send(subject, body, statusEl) {
  if (SHOP_EMAIL) {
    window.location.href = `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return true;
  }
  try {
    await navigator.clipboard.writeText(body);
    statusEl.textContent = "Copied — paste it into a message to Crews 3D Prints.";
  } catch {
    statusEl.textContent = "Couldn't copy automatically. Message Crews 3D Prints with your order.";
  }
  return false;
}

function bindBag() {
  $("#bag-open").addEventListener("click", openBag);
  $("#bag-close").addEventListener("click", closeBag);
  $("#scrim").addEventListener("click", closeBag);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#bag").hidden) closeBag();
    if (e.key === "Tab" && !$("#bag").hidden) {
      const focusable = [...$("#bag").querySelectorAll("button:not([disabled])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  $("#bag-items").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qty]");
    if (!b) return;
    bag[Number(b.dataset.index)].qty += Number(b.dataset.qty);
    saveBag();
  });
  $("#checkout").addEventListener("click", () => send("Order — Crews 3D Prints", orderText(), $("#bag-note")));
  $("#vip-join").addEventListener("click", () => {
    if (!bag.some((x) => x.id === VIP.id)) addToBag({ id: VIP.id, filament: null });
    toast("VIP membership is in your bag");
  });
  renderBag();
}

/* HyperFrames players --------------------------------------------------------- */

function whenReady(player) {
  return new Promise((resolve) => {
    if (player.ready) resolve(player);
    else player.addEventListener("ready", () => resolve(player), { once: true });
  });
}

async function heroPlayer() {
  const player = $("#hero-player");
  await customElements.whenDefined("hyperframes-player");
  await whenReady(player);
  if (reduceMotion.matches) {
    // A still of the finished vase. The poster only clears on play(), so drop it.
    player.seek(8.4);
    player.removeAttribute("poster");
    return;
  }
  let visible = true;
  const sync = () => (visible && !document.hidden ? player.play() : player.pause());
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(player);
  document.addEventListener("visibilitychange", sync);
  sync();
}

async function processScrub() {
  const track = $("#process-track");
  const player = $("#process-player");
  const steps = [...document.querySelectorAll("#steps li")];
  const fill = $("#scrub-fill");
  let duration = 0;
  let queued = false;

  const update = () => {
    queued = false;
    const rect = track.getBoundingClientRect();
    const sticky = track.firstElementChild.getBoundingClientRect().height;
    const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - sticky)));
    fill.style.transform = `scaleX(${p})`;
    const active = Math.min(3, Math.floor(p * 4));
    steps.forEach((li, i) => li.classList.toggle("is-active", i === active));
    if (duration) player.seek(Math.min(duration - 0.001, p * duration));
  };
  const onScroll = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  await customElements.whenDefined("hyperframes-player");
  await whenReady(player);
  duration = player.duration || 10;
  player.pause();
  update();
  // This player is only ever seeked, and the poster only clears on play().
  player.removeAttribute("poster");
}

/* Spin wheel ------------------------------------------------------------------ */

// The prize slice is exactly 1% of the wheel, because those are the odds.
const WIN_DEG = 3.6;
const LOSE_LABELS = ["Nope", "Nah", "Not today", "Nope", "So close", "Nope", "Tomorrow?", "Nope", "Nah"];

function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const p0 = [cx + r * Math.cos(rad(a0)), cy + r * Math.sin(rad(a0))];
  const p1 = [cx + r * Math.cos(rad(a1)), cy + r * Math.sin(rad(a1))];
  return `M ${cx} ${cy} L ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} Z`;
}

function renderWheel() {
  const wheel = $("#wheel");
  const loseSpan = (360 - WIN_DEG) / LOSE_LABELS.length;
  let out = `<circle cx="200" cy="200" r="198" fill="#16110d"/>`;
  LOSE_LABELS.forEach((label, i) => {
    const a0 = WIN_DEG / 2 + i * loseSpan;
    const a1 = a0 + loseSpan;
    const mid = (a0 + a1) / 2;
    out += `<path d="${arcPath(200, 200, 186, a0, a1)}" fill="${i % 2 ? "#f4f1ec" : "#ffffff"}" stroke="#16110d" stroke-width="1.5"/>`;
    out += `<text transform="rotate(${mid - 90} 200 200)" x="318" y="205.5" text-anchor="middle" fill="#16110d">${label}</text>`;
  });
  out += `<path d="${arcPath(200, 200, 186, -WIN_DEG / 2, WIN_DEG / 2)}" fill="#ff5b1f"/>`;
  out += `<text transform="rotate(-90 200 104)" x="200" y="108" text-anchor="middle" fill="#16110d" style="font-size:11px;letter-spacing:.18em">FREE PRINT</text>`;
  out += `<circle cx="200" cy="200" r="46" fill="#16110d"/>`;
  out += `<g transform="translate(176 176) scale(1.2)" fill="#ff5b1f"><rect x="8" y="4" width="28" height="6" rx="3"/><rect x="4" y="12.5" width="16" height="6" rx="3"/><rect x="4" y="21.5" width="16" height="6" rx="3"/><rect x="8" y="30" width="28" height="6" rx="3"/></g>`;
  wheel.innerHTML = out;
}

function spinCooldown() {
  const last = store.get(SPIN_KEY, 0);
  return Math.max(0, last + DAY - Date.now());
}

function formatWait(ms) {
  const minutes = Math.ceil(ms / 60000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function bindSpin() {
  renderWheel();
  const button = $("#spin-button");
  const result = $("#spin-result");
  const wheel = $("#wheel");
  let rotation = 0;

  const lockIfNeeded = () => {
    const wait = spinCooldown();
    button.disabled = wait > 0;
    if (wait > 0 && !result.classList.contains("win")) result.textContent = `Next spin in ${formatWait(wait)}`;
  };
  lockIfNeeded();

  button.addEventListener("click", () => {
    if (spinCooldown() > 0) return;
    button.disabled = true;
    result.classList.remove("win");
    result.textContent = "Spinning…";
    const win = Math.random() < 0.01;
    // Where the pointer should land, in degrees clockwise from the top of the wheel.
    let target;
    if (win) {
      target = (Math.random() - 0.5) * (WIN_DEG * 0.6);
    } else {
      const loseSpan = (360 - WIN_DEG) / LOSE_LABELS.length;
      const i = Math.floor(Math.random() * LOSE_LABELS.length);
      target = WIN_DEG / 2 + i * loseSpan + loseSpan * (0.2 + Math.random() * 0.6);
    }
    const base = Math.ceil(rotation / 360) * 360 + 360 * 6;
    rotation = base + (360 - target);
    wheel.style.transform = `rotate(${rotation}deg)`;
    store.set(SPIN_KEY, Date.now());
    const settle = reduceMotion.matches ? 50 : 5300;
    setTimeout(() => {
      if (win) {
        result.classList.add("win");
        result.textContent = "Winner. A free print is yours — screenshot this and send it with your order.";
      } else {
        result.textContent = `Nope! Next spin in ${formatWait(spinCooldown())}`;
      }
    }, settle);
  });
  setInterval(lockIfNeeded, 60000);
}

/* Custom order form ----------------------------------------------------------- */

function bindForm() {
  const form = $("#custom-form");
  $("#custom-filament").innerHTML = FILAMENTS.map(
    (f) => `<option value="${f.name}"${f.id === "orange" ? " selected" : ""}>${f.name}</option>`,
  ).join("");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#form-status");
    let ok = true;
    form.querySelectorAll("[required]").forEach((field) => {
      const valid = field.value.trim() !== "" && (field.type !== "email" || /\S+@\S+\.\S+/.test(field.value));
      field.setAttribute("aria-invalid", String(!valid));
      if (!valid) ok = false;
    });
    if (!ok) {
      status.textContent = "Fill in the highlighted fields.";
      return;
    }
    const data = new FormData(form);
    const body = [
      `Name: ${data.get("name")}`,
      `Email: ${data.get("email")}`,
      `Filament: ${data.get("filament")}`,
      `How many: ${data.get("qty")}`,
      "",
      `${data.get("idea")}`,
    ].join("\n");
    const opened = await send("Custom print request", body, status);
    if (opened) status.textContent = "Opening your email app…";
  });
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false");
  });
}

/* Page chrome ------------------------------------------------------------------- */

function bindReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion.matches) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((el) => io.observe(el));
}

function bindNav() {
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

renderProducts();
bindProducts();
renderSpools();
bindBag();
bindSpin();
bindForm();
bindReveal();
bindNav();
$("#year").textContent = new Date().getFullYear();
heroPlayer();
processScrub();
