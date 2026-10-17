/* Bloom Bakery: storefront script. Talks to the Express API in /src. */
"use strict";

const $ = (s) => document.querySelector(s);
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CATS = ["All", "Cakes", "Pastries", "Breads", "Cookies"];
const PHOTOS = {
  Cakes: ["/img/cakes.jpg", "A raspberry and rose dome dusted with icing sugar, ringed by fresh raspberries"],
  Pastries: ["/img/pastries.jpg", "Burnt meringue tartlets on cocoa sablé with salted caramel"],
  Breads: ["/img/breads.jpg", "A sliced olive and rosemary loaf being dusted with flour"],
  Cookies: ["/img/cookies.jpg", "Brown butter chocolate chip cookies in a parchment-lined bowl, one broken open"],
};

let MENU = [], by = {}, CAKE = null, SHOP = null, FESTIVE = null, DEMO = false;
let cat = "All";

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || "Something went wrong. Please try again."); e.field = data.field; throw e; }
  return data;
}

/* ---------- IST time helpers (the shop runs on India time) ---------- */
const IST = 5.5 * 3600e3;
const istNow = () => new Date(Date.now() + IST); // read with getUTC*
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (w) => `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
const longDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const istInstant = (s) => new Date(Date.parse(s + ":00Z") - IST);

/* ---------- menu ---------- */
function renderCats() {
  $("#cats").innerHTML = CATS.map((c) => `<button class="cat" type="button" data-c="${c}" aria-pressed="${c === cat}">${c}</button>`).join("");
}
function addBtn(m) {
  return m.soldOut
    ? `<button class="add" type="button" disabled aria-label="${esc(m.name)} has sold out">Sold out</button>`
    : `<button class="add" type="button" data-add="${m.id}" aria-label="Add ${esc(m.name)} to order">Add</button>`;
}
function dish(m) {
  return `<article class="dish"${m.soldOut ? ' style="opacity:.55"' : ""}><h3>${esc(m.name)}</h3><div class="price">${inr(m.p)}</div>
    <p class="desc">${esc(m.desc)}</p><p class="al">Contains ${esc(m.al)}</p>
    <div class="foot"><span class="wt num">${esc(m.g)}</span>${m.egg ? '<span class="egg">Eggless</span>' : ""}${addBtn(m)}</div></article>`;
}
const visual = (c) => (PHOTOS[c] ? `<figure class="cat-photo"><img src="${PHOTOS[c][0]}" alt="${PHOTOS[c][1]}" loading="lazy"></figure>` : "");
function renderMenu() {
  const eg = $("#eggless").checked;
  const list = MENU.filter((m) => m.cat !== "Diwali" && (cat === "All" || m.cat === cat) && (!eg || m.egg));
  if (!list.length) { $("#menuList").innerHTML = `<p class="empty">Nothing in ${cat.toLowerCase()} is eggless as it stands. Ask us for an eggless version when you order.</p>`; return; }
  const shown = cat === "All" ? CATS.slice(1) : [cat];
  $("#menuList").innerHTML = shown.map((c) => {
    const it = list.filter((m) => m.cat === c);
    return it.length ? (cat === "All" ? `<h3 class="group-h">${c}</h3>` : "") + visual(c) + it.map(dish).join("") : "";
  }).join("");
}
$("#cats").addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (!b) return; cat = b.dataset.c; renderCats(); renderMenu(); });
$("#eggless").addEventListener("change", renderMenu);

/* ---------- cart ---------- */
let cart = {};
try { const s = JSON.parse(localStorage.getItem("bloom-order")); if (s && typeof s === "object") cart = s; } catch (e) {}
let done = null, placing = false;
const save = () => { try { localStorage.setItem("bloom-order", JSON.stringify(cart)); } catch (e) {} };
const items = () => Object.values(cart).reduce((a, b) => a + b, 0);
const total = () => Object.entries(cart).reduce((a, [k, q]) => a + (by[k]?.p || 0) * q, 0);
function pruneCart() { for (const id of Object.keys(cart)) if (!by[id] || by[id].soldOut || !(cart[id] > 0)) delete cart[id]; save(); }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  const id = b.dataset.add; if (!by[id] || by[id].soldOut) return;
  cart[id] = (cart[id] || 0) + 1; done = null; save(); render();
  b.textContent = "Added"; b.classList.add("ok"); setTimeout(() => { b.textContent = "Add"; b.classList.remove("ok"); }, 1000);
  toast(`${by[id].name} added to your order`);
});

function slots() {
  // Same rules the server checks: every 30 min, 8:00 to 20:30, 30 min lead time, closed Mondays.
  const out = [], n = istNow(), nowMin = n.getUTCHours() * 60 + n.getUTCMinutes();
  for (let d = 0; d < 3 && out.length < 24; d++) {
    const day = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + d));
    if (day.getUTCDay() === SHOP.closedWeekday) continue;
    const label = d === 0 ? "Today" : d === 1 ? "Tomorrow" : day.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
    for (let m = SHOP.openMin; m <= SHOP.lastSlotMin; m += 30) {
      if (d === 0 && m < nowMin + 30) continue;
      const t = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      out.push({ value: `${isoDate(day)}T${t}`, label: `${label}, ${t}` });
    }
  }
  return out;
}
function renderBar() {
  const n = items(), open = $("#drawer").classList.contains("open");
  $("#bar").hidden = !n || open;
  document.body.classList.toggle("has-bar", !!n);
  $("#barText").textContent = `${n} item${n === 1 ? "" : "s"}, ${inr(total())}`;
}
function render() {
  $("#count").textContent = items();
  renderBar();
  const body = $("#dBody"), foot = $("#dFoot");
  if (done) {
    body.innerHTML = `<div class="conf"><h3>Order placed</h3><div class="code">${esc(done.code)}</div>
      <p>Thank you, <strong>${esc(done.name)}</strong>. Collect it <strong>${esc(done.when)}</strong> and pay <strong>${inr(done.total)}</strong> at the counter.</p>
      <p class="demo">${DEMO ? "Demo mode: this copy of the site has no backend, so the order wasn't saved anywhere." : "Show this code at the counter. Your order is saved with the shop."}</p></div>`;
    foot.innerHTML = `<button class="ghost" type="button" id="again">Start a new order</button>`; return;
  }
  const ids = Object.keys(cart).filter((id) => by[id]);
  if (!ids.length) {
    body.innerHTML = `<div class="d-empty"><h3>Nothing here yet</h3><p>Add something from the menu and it will appear here with a running total.</p></div>`;
    foot.innerHTML = `<button class="ghost" type="button" id="browse">Browse the menu</button>`; return;
  }
  body.innerHTML = ids.map((id) => { const m = by[id], q = cart[id]; return `<div class="ln"><div><div class="nm">${esc(m.name)}</div><div class="each num">${inr(m.p)} each · ${esc(m.g)}</div></div><div class="tot num">${inr(m.p * q)}</div><div class="qty"><button type="button" data-q="${id}" data-d="-1" aria-label="Remove one ${esc(m.name)}">−</button><span aria-label="Quantity">${q}</span><button type="button" data-q="${id}" data-d="1" aria-label="Add one ${esc(m.name)}">+</button></div></div>`; }).join("");
  const keep = { n: $("#oName")?.value || "", p: $("#oPhone")?.value || "", s: $("#oSlot")?.value || "" };
  const sl = slots();
  foot.innerHTML = `<div class="sum"><span>Total, ${items()} item${items() > 1 ? "s" : ""}</span><span class="big">${inr(total())}</span></div>
  <form id="oForm" novalidate style="display:grid;gap:12px">
    <div class="f"><label for="oName">Name</label><input id="oName" autocomplete="name" required></div>
    <div class="pair">
      <div class="f"><label for="oPhone">Mobile number</label><input id="oPhone" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98110 47320" required></div>
      <div class="f"><label for="oSlot">Pickup time</label><select id="oSlot">${sl.map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}</select></div>
    </div>
    <p class="err" id="oErr" role="alert"></p>
    <button class="place" type="submit"${placing ? " disabled" : ""}>${placing ? "Placing order…" : "Place pickup order"}</button>
    <p class="demo">${DEMO ? "Demo mode: orders show a confirmation but aren't saved." : "Pay at the counter when you collect."}</p>
  </form>`;
  $("#oName").value = keep.n; $("#oPhone").value = keep.p;
  if (keep.s && sl.some((s) => s.value === keep.s)) $("#oSlot").value = keep.s;
}
$("#dBody").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (!b) return; const id = b.dataset.q; cart[id] = (cart[id] || 0) + Number(b.dataset.d); if (cart[id] <= 0) delete cart[id]; save(); render(); });
$("#dFoot").addEventListener("input", (e) => { if (e.target.id === "oPhone") { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); } e.target.removeAttribute?.("aria-invalid"); });
$("#dFoot").addEventListener("submit", async (e) => {
  e.preventDefault(); if (placing) return;
  const err = $("#oErr"), btn = e.target.querySelector(".place");
  const n = $("#oName").value.trim(), p = $("#oPhone").value.trim(), slot = $("#oSlot").value;
  const bad = (id, msg) => { err.textContent = msg; $(id).setAttribute("aria-invalid", "true"); $(id).focus(); };
  if (n.length < 2) return bad("#oName", "Enter your name so we know whose order it is.");
  if (!/^[6-9]\d{9}$/.test(p)) return bad("#oPhone", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9.");
  if (!slot) return bad("#oSlot", "Choose a pickup time.");
  placing = true; btn.disabled = true; btn.textContent = "Placing order…"; err.textContent = "";
  try {
    const r = DEMO
      ? { code: demoCode("BB"), name: n, total: total(), pickupAt: slot }
      : await api("/api/orders", { name: n, phone: p, pickup: slot, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) });
    const label = $("#oSlot").selectedOptions[0]?.textContent || r.pickupAt;
    done = { code: r.code, name: r.name, total: r.total, when: label.replace(", ", " at ") };
    cart = {}; save(); placing = false; render(); $("#dBody").scrollTop = 0;
  } catch (ex) {
    placing = false; btn.disabled = false; btn.textContent = "Place pickup order";
    err.textContent = ex.message;
    if (ex.field === "items") loadMenu(false); // a price or sold-out flag may have changed
    const map = { name: "#oName", phone: "#oPhone", pickup: "#oSlot" };
    if (map[ex.field]) $(map[ex.field]).setAttribute("aria-invalid", "true");
  }
});
$("#dFoot").addEventListener("click", (e) => { if (e.target.id === "again") { done = null; render(); } if (e.target.id === "browse") { closeD(); location.hash = "menu"; } });

/* ---------- drawer ---------- */
let lastFocus = null;
const behind = ["header", "main", "footer"];
function openD() { lastFocus = document.activeElement; $("#scrim").hidden = false; $("#drawer").classList.add("open"); document.body.style.overflow = "hidden"; behind.forEach((s) => ($(s).inert = true)); render(); setTimeout(() => $("#closeOrder").focus(), 50); }
function closeD() { $("#scrim").hidden = true; $("#drawer").classList.remove("open"); document.body.style.overflow = ""; behind.forEach((s) => ($(s).inert = false)); renderBar(); if (lastFocus && document.contains(lastFocus) && !lastFocus.hidden) lastFocus.focus(); }
$("#openOrder").onclick = openD; $("#bar").onclick = openD; $("#closeOrder").onclick = closeD; $("#scrim").onclick = closeD;
document.addEventListener("keydown", (e) => {
  if (!$("#drawer").classList.contains("open")) return;
  if (e.key === "Escape") { closeD(); return; }
  if (e.key !== "Tab") return;
  const f = [...$("#drawer").querySelectorAll("button,input,select,textarea,a[href]")].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- open-now status ---------- */
function openStatus() {
  const n = istNow(), day = n.getUTCDay(), m = n.getUTCHours() * 60 + n.getUTCMinutes();
  if (day === 1) return [false, "Closed on Mondays. Opens Tuesday at 8:00."];
  if (m < 480) return [false, "Opens today at 8:00."];
  if (m < 1260) { const left = 1260 - m; return [true, left <= 60 ? `Open now, closing in ${left} minutes.` : "Open now, until 21:00."]; }
  return [false, day === 0 ? "Closed now. Opens Tuesday at 8:00." : "Closed now. Opens tomorrow at 8:00."];
}
function renderStatus() { const [on, t] = openStatus(); ["#heroStatus", "#visitStatus"].forEach((s) => { $(s).innerHTML = `<span class="dot${on ? " on" : ""}" aria-hidden="true"></span>${t}`; }); }

/* ---------- diwali ---------- */
function renderDiwali() {
  const now = Date.now(), close = istInstant(FESTIVE.ordersClose).getTime(), end = istInstant(FESTIVE.pickupEnd).getTime();
  if (now > end) { $("#diwali").hidden = true; $("#navDiwali").hidden = true; return; }
  const days = Math.ceil((close - now) / 864e5);
  $("#closes").textContent = now > close ? "Orders have closed. Any boxes left are on the counter until 8 November."
    : days <= 1 ? "Orders close tonight at 9 pm. Pickup from 1 to 8 November."
    : `Orders close on 5 November, ${days} days from today. Pickup from 1 to 8 November.`;
  $("#boxes").innerHTML = MENU.filter((m) => m.cat === "Diwali").map((m) => `<article class="box"><h3>${esc(m.name)}</h3><p class="desc">${esc(m.desc)}</p><p class="al">Contains ${esc(m.al)}</p>
    <div class="row"><span class="price">${inr(m.p)}</span><span class="wt num" style="color:var(--ivory-dim);font-size:.88rem">${esc(m.g)}</span>${m.egg ? '<span class="egg">Eggless</span>' : ""}${now > close ? "" : addBtn(m)}</div></article>`).join("");
}

/* ---------- custom cake enquiry ---------- */
let cakeDone = null, sending = false;
function minCakeDate() {
  const n = istNow(); const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + CAKE.minNoticeDays));
  if (d.getUTCDay() === SHOP.closedWeekday) d.setUTCDate(d.getUTCDate() + 1);
  return isoDate(d);
}
function cakeEstimate() {
  const f = CAKE.flavours[Number($("#cFlav").value)], kg = Number(document.querySelector("input[name=cSize]:checked").value);
  return Math.round((f.perKg * kg) / 50) * 50;
}
function renderCake() {
  const area = $("#cakeArea");
  if (cakeDone) {
    const c = cakeDone;
    area.innerHTML = `<div class="cake-done" tabindex="-1" id="cakeDone"><h3>Enquiry received</h3><div class="code">${esc(c.code)}</div>
      <dl><dt>Cake</dt><dd>${esc(c.flavour)}, ${c.kg} kg${c.eggless ? ", eggless" : ""}</dd><dt>For</dt><dd>${esc(c.occasion)}, ${longDate(c.date)}</dd>${c.message ? `<dt>Message</dt><dd>“${esc(c.message)}”</dd>` : ""}<dt>Estimate</dt><dd class="num">${inr(c.estimate)}</dd></dl>
      <p style="color:var(--ivory-dim);font-weight:300">${DEMO ? "Demo mode: this copy of the site has no backend, so the enquiry wasn't saved anywhere." : `We'll call ${esc(c.name)} within the day to confirm the design and final price. Keep this reference handy.`}</p>
      <button class="ghost" type="button" id="cakeAgain" style="justify-self:start;padding:12px 22px">Start another enquiry</button></div>`;
    $("#cakeDone").focus(); return;
  }
  const min = minCakeDate(), firstOpen = CAKE.flavours.findIndex((f) => f.perKg);
  area.innerHTML = `<form class="cake-form" id="cakeForm" novalidate>
    <div class="f"><label for="cName">Name</label><input id="cName" autocomplete="name"></div>
    <div class="f"><label for="cPhone">Mobile number</label><input id="cPhone" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98110 47320"></div>
    <div class="f"><label for="cOcc">Occasion</label><select id="cOcc">${CAKE.occasions.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>
    <div class="f"><label for="cDate">Pickup date</label><input id="cDate" type="date" min="${min}" value="${min}"></div>
    <div class="f full"><label for="cFlav">Flavour</label><select id="cFlav">${CAKE.flavours.map((f, i) => `<option value="${i}"${f.perKg ? "" : " disabled"}${i === firstOpen ? " selected" : ""}>${esc(f.name)}${f.perKg ? `, ${inr(f.perKg)} per kg` : ""}</option>`).join("")}</select></div>
    <fieldset class="full"><legend>Size</legend><div class="sizes">${CAKE.sizes.map((s, i) => `<label class="size"><input type="radio" name="cSize" value="${s.kg}"${i === 1 ? " checked" : ""}><span><b>${s.kg} kg</b><small>Serves ${s.serves}</small></span></label>`).join("")}</div></fieldset>
    <label class="switch full" for="cEgg"><input type="checkbox" id="cEgg"><span class="tr" aria-hidden="true"></span>Make it eggless</label>
    <div class="f full"><label for="cMsg">Message on the cake</label><input id="cMsg" maxlength="30" placeholder="Happy 30th, Meera"><span class="hint"><span>Optional. Piped in white chocolate.</span><span id="cCount" class="num">0 / 30</span></span></div>
    <div class="f full"><label for="cNotes">Design notes</label><textarea id="cNotes" maxlength="500" placeholder="Colours, a theme, a photo you'll bring along, anything we should know"></textarea></div>
    <p class="err full" id="cErr" role="alert"></p>
    <div class="estimate"><div><div class="muted">Estimated price</div><div class="big" id="cEst" aria-live="polite"></div><div class="muted">Final price confirmed on the call. Decorations may add to it.</div></div><button class="place" type="submit">Send enquiry</button></div>
  </form>`;
  $("#cEst").textContent = inr(cakeEstimate());
}
const updateEst = () => { if ($("#cEst")) $("#cEst").textContent = inr(cakeEstimate()); };
$("#cakeArea").addEventListener("input", (e) => {
  if (e.target.id === "cPhone") e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
  if (e.target.id === "cMsg") $("#cCount").textContent = `${e.target.value.length} / 30`;
  e.target.removeAttribute?.("aria-invalid"); updateEst();
});
$("#cakeArea").addEventListener("change", updateEst);
$("#cakeArea").addEventListener("submit", async (e) => {
  e.preventDefault(); if (sending) return;
  const err = $("#cErr"), btn = e.target.querySelector(".place");
  const bad = (id, msg) => { err.textContent = msg; $(id).setAttribute("aria-invalid", "true"); $(id).focus(); };
  const n = $("#cName").value.trim(), p = $("#cPhone").value.trim(), dv = $("#cDate").value;
  if (n.length < 2) return bad("#cName", "Enter your name so we know who to call.");
  if (!/^[6-9]\d{9}$/.test(p)) return bad("#cPhone", "Enter a 10-digit mobile number starting with 6, 7, 8 or 9.");
  if (!dv) return bad("#cDate", "Choose a pickup date.");
  if (dv < minCakeDate()) return bad("#cDate", `Custom cakes need 48 hours. The earliest pickup is ${longDate(minCakeDate())}.`);
  if (new Date(dv + "T12:00:00Z").getUTCDay() === SHOP.closedWeekday) return bad("#cDate", "We're closed on Mondays. Choose another day.");
  sending = true; btn.disabled = true; btn.textContent = "Sending…"; err.textContent = "";
  try {
    const body = {
      name: n, phone: p, occasion: $("#cOcc").value, flavour: CAKE.flavours[Number($("#cFlav").value)].name,
      kg: Number(document.querySelector("input[name=cSize]:checked").value), eggless: $("#cEgg").checked,
      date: dv, message: $("#cMsg").value.trim(), notes: $("#cNotes").value.trim(),
    };
    cakeDone = DEMO ? { ...body, code: demoCode("CK"), estimate: cakeEstimate() } : await api("/api/enquiries", body);
    renderCake();
  } catch (ex) {
    btn.disabled = false; btn.textContent = "Send enquiry"; err.textContent = ex.message;
    const map = { name: "#cName", phone: "#cPhone", date: "#cDate", flavour: "#cFlav" };
    if (map[ex.field]) $(map[ex.field]).setAttribute("aria-invalid", "true");
  } finally { sending = false; }
});
$("#cakeArea").addEventListener("click", (e) => { if (e.target.id === "cakeAgain") { cakeDone = null; renderCake(); $("#cName").focus(); } });

/* ---------- hours, copy buttons, nav highlight ---------- */
const HOURS = [["Monday", "Closed"], ["Tuesday", "8:00 – 21:00"], ["Wednesday", "8:00 – 21:00"], ["Thursday", "8:00 – 21:00"], ["Friday", "8:00 – 21:00"], ["Saturday", "8:00 – 21:00"], ["Sunday", "8:00 – 21:00"]];
const ti = (istNow().getUTCDay() + 6) % 7;
$("#hours").innerHTML = HOURS.map((h, i) => `<tr${i === ti ? ' class="today"' : ""}><td>${h[0]}</td><td>${h[1]}</td></tr>`).join("");

document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => {
  const el = document.getElementById(b.dataset.copy), t = el.textContent;
  const fallback = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C to copy."); };
  try { navigator.clipboard.writeText(t).then(() => toast("Copied " + t), fallback); } catch (e) { fallback(); }
}));

const navLinks = [...document.querySelectorAll(".top nav a")];
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting) return; navLinks.forEach((a) => (a.getAttribute("href") === "#" + en.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"))); }), { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main section[id]").forEach((s) => io.observe(s));
}

/* ---------- boot ---------- */
function applyData(data) {
  MENU = data.items; by = Object.fromEntries(MENU.map((m) => [m.id, m]));
  CAKE = data.cake; SHOP = data.shop; FESTIVE = data.festive;
}
async function loadMenu(first = true) {
  if (DEMO && !first) return;
  try {
    applyData(await api("/api/menu"));
  } catch (e) {
    // No backend reachable (for example a static host like Netlify): run in demo mode from data.js.
    if (!first) return;
    if (!window.BLOOM_FALLBACK) {
      $("#menuList").innerHTML = `<p class="empty">The menu couldn't load. Check your connection and refresh the page.</p>`;
      $("#cakeArea").innerHTML = `<p class="empty" style="padding:0">The enquiry form couldn't load. Refresh the page to try again.</p>`;
      return;
    }
    DEMO = true;
    applyData(window.BLOOM_FALLBACK);
  }
  pruneCart(); renderMenu(); renderDiwali(); if (first) renderCake(); render();
}
const demoCode = (p) => `${p}-${Math.floor(1000 + Math.random() * 9000)}`;
renderCats(); renderStatus(); setInterval(renderStatus, 60000);
$("#menuList").innerHTML = `<p class="empty">Loading today's menu…</p>`;
loadMenu();
