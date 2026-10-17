import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";
import { openDb } from "../src/db.js";

// Freeze the clock at Friday 16 Oct 2026, 10:00 IST so date rules are predictable.
const NOW = Date.parse("2026-10-16T10:00:00+05:30");
let server, base, db, cookie = "";

before(async () => {
  // Set TEST_DATABASE_URL to run the same tests against a real Postgres server.
  const url = process.env.TEST_DATABASE_URL;
  db = await openDb(url ? { url } : { memory: true });
  if (url) await db.exec("TRUNCATE orders, order_items, enquiries RESTART IDENTITY; UPDATE menu_items SET sold_out = false;");
  const app = createApp({ db, password: "test-pass", secret: "test-secret", now: () => NOW });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

const call = async (path, { method = "GET", body, auth } = {}) => {
  const res = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
};

const order = (over = {}) => ({ name: "Meera Sharma", phone: "9811047320", pickup: "2026-10-17T12:00", items: [{ id: "crois", qty: 2 }, { id: "sour", qty: 1 }], ...over });

test("menu lists every item with prices and cake options", async () => {
  const { status, data } = await call("/api/menu");
  assert.equal(status, 200);
  assert.equal(data.items.length, 15);
  assert.equal(data.items.find((i) => i.id === "crois").p, 180);
  assert.ok(data.cake.flavours.length >= 4);
});

test("an order is priced on the server, not by the browser", async () => {
  const { status, data } = await call("/api/orders", { method: "POST", body: order({ total: 1, items: [{ id: "crois", qty: 2, price: 1 }, { id: "sour", qty: 1 }] }) });
  assert.equal(status, 201);
  assert.equal(data.total, 2 * 180 + 380);
  assert.match(data.code, /^BB-\d{4}$/);
});

test("duplicate lines are merged", async () => {
  const { data } = await call("/api/orders", { method: "POST", body: order({ items: [{ id: "crois", qty: 1 }, { id: "crois", qty: 2 }] }) });
  assert.equal(data.lines.length, 1);
  assert.equal(data.lines[0].qty, 3);
});

test("bad input is rejected with a clear message", async () => {
  const cases = [
    [order({ phone: "12345" }), "phone"],
    [order({ name: "" }), "name"],
    [order({ items: [] }), "items"],
    [order({ items: [{ id: "nope", qty: 1 }] }), "items"],
    [order({ items: [{ id: "crois", qty: 1.5 }] }), "items"],
    [order({ items: [{ id: "crois", qty: 99 }] }), "items"],
    [order({ pickup: "2026-10-19T12:00" }), "pickup"], // Monday
    [order({ pickup: "2026-10-16T10:15" }), "pickup"], // not on a 30-minute slot
    [order({ pickup: "2026-10-16T10:00" }), "pickup"], // right now, too soon
    [order({ pickup: "2026-10-17T21:00" }), "pickup"], // after the last slot
    [order({ pickup: "2026-11-01T12:00" }), "pickup"], // more than 7 days ahead
  ];
  for (const [body, field] of cases) {
    const { status, data } = await call("/api/orders", { method: "POST", body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(data.field, field);
    assert.ok(data.error.length > 10);
  }
});

const enquiry = (over = {}) => ({ name: "Arjun", phone: "+91 98110 47320", occasion: "Birthday", flavour: "Rasmalai", kg: 1.5, eggless: true, date: "2026-10-18", message: "Happy 30th", ...over });

test("cake enquiry is saved with a server-side estimate", async () => {
  const { status, data } = await call("/api/enquiries", { method: "POST", body: enquiry() });
  assert.equal(status, 201);
  assert.equal(data.estimate, 2850); // 1900 x 1.5
  assert.equal(data.eggless, true);
  assert.equal(data.phone, undefined);
});

test("cake enquiry enforces 48 hours, Mondays and available flavours", async () => {
  for (const [over, field] of [[{ date: "2026-10-17" }, "date"], [{ date: "2026-10-19" }, "date"], [{ flavour: "Alphonso & vanilla, returns in April" }, "flavour"], [{ kg: 7 }, "kg"]]) {
    const { status, data } = await call("/api/enquiries", { method: "POST", body: enquiry(over) });
    assert.equal(status, 400);
    assert.equal(data.field, field);
  }
});

test("admin routes need a login", async () => {
  assert.equal((await call("/api/admin/orders")).status, 401);
  assert.equal((await call("/api/admin/login", { method: "POST", body: { password: "wrong" } })).status, 401);
  const ok = await call("/api/admin/login", { method: "POST", body: { password: "test-pass" } });
  assert.equal(ok.status, 200);
  const set = ok.headers.get("set-cookie");
  assert.match(set, /HttpOnly/i);
  cookie = set.split(";")[0];
});

test("admin sees orders and moves them through the day", async () => {
  const list = await call("/api/admin/orders?day=2026-10-17", { auth: true });
  assert.equal(list.status, 200);
  assert.ok(list.data.length >= 2);
  const first = list.data[0];
  assert.ok(first.items.length >= 1);
  assert.equal((await call(`/api/admin/orders/${first.id}`, { method: "PATCH", body: { status: "ready" }, auth: true })).status, 200);
  assert.equal((await call(`/api/admin/orders/${first.id}`, { method: "PATCH", body: { status: "eaten" }, auth: true })).status, 400);
  const enq = await call("/api/admin/enquiries?status=new", { auth: true });
  assert.equal(enq.data.length, 1);
});

test("a sold-out item can't be ordered", async () => {
  assert.equal((await call("/api/admin/menu/crois", { method: "PATCH", body: { soldOut: true }, auth: true })).status, 200);
  const menu = await call("/api/menu");
  assert.equal(menu.data.items.find((i) => i.id === "crois").soldOut, true);
  const { status, data } = await call("/api/orders", { method: "POST", body: order() });
  assert.equal(status, 400);
  assert.match(data.error, /sold out/);
});

test("security headers are set", async () => {
  const res = await fetch(base + "/");
  assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(res.headers.get("x-powered-by"), null);
});
