"use strict";
const $ = (s) => document.querySelector(s);
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const phoneFmt = (p) => `${p.slice(0, 5)} ${p.slice(5)}`;
const istToday = () => { const n = new Date(Date.now() + 5.5 * 3600e3); return n.toISOString().slice(0, 10); };
const dayLabel = (d) => (d === istToday() ? "Today" : new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));

let tab = "orders", orderStatus = "active", enqStatus = "new", timer = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith("/login")) { showLogin(); throw new Error("Session ended. Log in again."); }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }

/* ---------- auth ---------- */
function showLogin() { clearInterval(timer); $("#appView").hidden = true; $("#loginView").hidden = false; $("#pw").focus(); }
function showApp() { $("#loginView").hidden = true; $("#appView").hidden = false; refresh(); clearInterval(timer); timer = setInterval(refresh, 30000); }
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await api("/api/admin/login", { method: "POST", body: { password: $("#pw").value } }); $("#pw").value = ""; $("#loginErr").textContent = ""; showApp(); }
  catch (ex) { $("#loginErr").textContent = ex.message; $("#pw").select(); }
});
$("#logout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); });

/* ---------- summary ---------- */
async function loadSummary() {
  const s = await api("/api/admin/summary");
  $("#summary").innerHTML = [
    ["Pickups today", s.orders, false],
    ["Still to prepare", s.pending, s.pending > 0],
    ["Takings today", inr(s.revenue), false],
    ["New cake enquiries", s.newEnquiries, s.newEnquiries > 0],
  ].map(([k, v, attn]) => `<div class="tile${attn ? " attn" : ""}"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  $("#enqCount").textContent = s.newEnquiries;
}

/* ---------- orders ---------- */
const ORDER_FILTERS = [["active", "To do"], ["ready", "Ready"], ["collected", "Collected"], ["cancelled", "Cancelled"], ["all", "All"]];
const NEXT = { pending: [["ready", "Mark ready", true], ["cancelled", "Cancel"]], ready: [["collected", "Collected", true], ["pending", "Back to pending"]], collected: [["ready", "Undo"]], cancelled: [["pending", "Restore"]] };
function renderChips(el, list, current) { el.innerHTML = list.map(([v, l]) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${v === current}">${l}</button>`).join(""); }
async function loadOrders() {
  const day = $("#day").value;
  const q = new URLSearchParams(); if (day) q.set("day", day); if (!["active", "all"].includes(orderStatus)) q.set("status", orderStatus);
  let rows = await api("/api/admin/orders?" + q);
  if (orderStatus === "active") rows = rows.filter((o) => o.status === "pending" || o.status === "ready");
  $("#orders").innerHTML = rows.length ? rows.map((o) => {
    const [d, t] = o.pickup_at.split(" ");
    return `<article class="row${["collected", "cancelled"].includes(o.status) ? " done" : ""}">
      <div class="when"><b>${t}</b><span>${dayLabel(d)}</span></div>
      <div class="who"><b>${esc(o.name)}</b><span>${phoneFmt(o.phone)} · ${esc(o.code)}</span></div>
      <div class="what">${o.items.map((i) => `<b>${i.qty} ×</b> ${esc(i.name)}`).join("<br>")}</div>
      <div class="money">${inr(o.total)}</div>
      <div class="acts"><span class="pill ${o.status}">${o.status}</span>${NEXT[o.status].map(([s, l, go]) => `<button class="btn${go ? " go" : ""}" type="button" data-order="${o.id}" data-s="${s}">${l}</button>`).join("")}</div>
    </article>`;
  }).join("") : `<div class="empty"><b>No orders here</b>${day ? `Nothing ${orderStatus === "active" ? "left to do" : "matches"} for ${dayLabel(day).toLowerCase()}. Clear the date to see every day.` : "New pickup orders from the shop appear here."}</div>`;
}
$("#orderChips").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; orderStatus = b.dataset.v; renderChips($("#orderChips"), ORDER_FILTERS, orderStatus); loadOrders(); });
$("#day").addEventListener("change", loadOrders);
$("#orders").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-order]"); if (!b) return; b.disabled = true;
  try { await api(`/api/admin/orders/${b.dataset.order}`, { method: "PATCH", body: { status: b.dataset.s } }); toast(`Order marked ${b.dataset.s}`); await Promise.all([loadOrders(), loadSummary()]); }
  catch (ex) { toast(ex.message); b.disabled = false; }
});

/* ---------- enquiries ---------- */
const ENQ_FILTERS = [["new", "New"], ["confirmed", "Confirmed"], ["declined", "Declined"], ["all", "All"]];
async function loadEnquiries() {
  const rows = await api("/api/admin/enquiries" + (enqStatus === "all" ? "" : "?status=" + enqStatus));
  $("#enquiries").innerHTML = rows.length ? rows.map((q) => `<article class="row${q.status === "declined" ? " done" : ""}">
      <div class="when"><b style="font-size:1rem">${dayLabel(q.pickup_date)}</b><span>${esc(q.occasion)}</span></div>
      <div class="who"><b>${esc(q.name)}</b><span>${phoneFmt(q.phone)} · ${esc(q.code)}</span></div>
      <div class="what"><b>${esc(q.flavour)}, ${q.kg} kg</b>${q.eggless ? ", eggless" : ""}${q.message ? `<br>Message: “${esc(q.message)}”` : ""}${q.notes ? `<br>${esc(q.notes)}` : ""}</div>
      <div class="money">${inr(q.estimate)}</div>
      <div class="acts"><span class="pill ${q.status}">${q.status}</span>${q.status === "new" ? `<button class="btn go" type="button" data-enq="${q.id}" data-s="confirmed">Confirm</button><button class="btn" type="button" data-enq="${q.id}" data-s="declined">Decline</button>` : `<button class="btn" type="button" data-enq="${q.id}" data-s="new">Reopen</button>`}</div>
    </article>`).join("") : `<div class="empty"><b>No enquiries here</b>Cake enquiries from the shop's form appear here, soonest first.</div>`;
}
$("#enqChips").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; enqStatus = b.dataset.v; renderChips($("#enqChips"), ENQ_FILTERS, enqStatus); loadEnquiries(); });
$("#enquiries").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-enq]"); if (!b) return; b.disabled = true;
  try { await api(`/api/admin/enquiries/${b.dataset.enq}`, { method: "PATCH", body: { status: b.dataset.s } }); toast(`Enquiry marked ${b.dataset.s}`); await Promise.all([loadEnquiries(), loadSummary()]); }
  catch (ex) { toast(ex.message); b.disabled = false; }
});

/* ---------- menu ---------- */
async function loadMenu() {
  const rows = await api("/api/admin/menu");
  $("#menu").innerHTML = rows.map((m) => `<div class="menu-row"><div><div>${esc(m.name)}</div><div class="cat">${esc(m.category)}</div></div>
    <div class="money">${inr(m.price)}</div>
    <label class="toggle" for="so-${m.id}"><input type="checkbox" id="so-${m.id}" data-item="${m.id}"${m.sold_out ? " checked" : ""}><span class="tr" aria-hidden="true"></span>${m.sold_out ? "Sold out" : "Available"}</label></div>`).join("");
}
$("#menu").addEventListener("change", async (e) => {
  const c = e.target.closest("[data-item]"); if (!c) return;
  try { await api(`/api/admin/menu/${c.dataset.item}`, { method: "PATCH", body: { soldOut: c.checked } }); toast(c.checked ? "Marked sold out" : "Back on sale"); loadMenu(); }
  catch (ex) { toast(ex.message); c.checked = !c.checked; }
});

/* ---------- tabs and refresh ---------- */
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]"); if (!b) return; tab = b.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
  ["orders", "enquiries", "menu"].forEach((t) => ($("#tab-" + t).hidden = t !== tab));
  refresh();
});
async function refresh() {
  try {
    await Promise.all([loadSummary(), tab === "orders" ? loadOrders() : tab === "enquiries" ? loadEnquiries() : loadMenu()]);
    $("#updated").textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { if ($("#appView").hidden === false) $("#updated").textContent = "Couldn't refresh. Retrying in 30 seconds."; }
}

$("#day").value = istToday();
renderChips($("#orderChips"), ORDER_FILTERS, orderStatus);
renderChips($("#enqChips"), ENQ_FILTERS, enqStatus);
api("/api/admin/session").then((s) => (s.loggedIn ? showApp() : showLogin())).catch(showLogin);
