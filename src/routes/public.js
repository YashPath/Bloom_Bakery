import express from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { CAKE, SHOP, FESTIVE } from "../config.js";
import { validateOrder, validateEnquiry, InputError } from "../validate.js";

// Express 4 doesn't catch errors from async handlers on its own.
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toClient = (r) => ({
  id: r.id, cat: r.category, name: r.name, desc: r.description, g: r.weight,
  p: r.price, egg: !!r.eggless, al: r.allergens, soldOut: !!r.sold_out,
});

async function uniqueCode(q, table, prefix) {
  for (let i = 0; i < 20; i++) {
    const code = `${prefix}-${crypto.randomInt(1000, 10000)}`;
    const rows = await q.query(`SELECT 1 FROM ${table} WHERE code = $1`, [code]);
    if (!rows.length) return code;
  }
  return `${prefix}-${crypto.randomInt(10000, 100000)}`;
}

export function publicRoutes(db, { now = () => Date.now() } = {}) {
  const r = express.Router();
  const writeLimit = rateLimit({
    windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: "Too many requests from this device. Wait a few minutes and try again." },
  });

  const allItems = () => db.query("SELECT * FROM menu_items ORDER BY sort");

  r.get("/health", h(async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true, db: db.kind });
  }));

  r.get("/menu", h(async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      items: (await allItems()).map(toClient),
      cake: { flavours: CAKE.flavours, sizes: CAKE.sizes, occasions: CAKE.occasions, minNoticeDays: CAKE.minNoticeDays },
      shop: { openMin: SHOP.openMin, lastSlotMin: SHOP.lastSlotMin, closedWeekday: SHOP.closedWeekday, maxDaysAhead: SHOP.maxDaysAhead },
      festive: FESTIVE,
    });
  }));

  r.post("/orders", writeLimit, h(async (req, res) => {
    const menuById = new Map((await allItems()).map((i) => [i.id, i]));
    const o = validateOrder(req.body, menuById, now());
    const code = await db.tx(async (t) => {
      const c = await uniqueCode(t, "orders", "BB");
      const [{ id }] = await t.query(
        "INSERT INTO orders (code, name, phone, pickup_at, total) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [c, o.name, o.phone, o.pickupAt, o.total]
      );
      for (const l of o.lines) {
        await t.query("INSERT INTO order_items (order_id, item_id, name, unit_price, qty) VALUES ($1,$2,$3,$4,$5)", [id, l.id, l.name, l.unitPrice, l.qty]);
      }
      return c;
    });
    res.status(201).json({ code, name: o.name, pickupAt: o.pickupAt, total: o.total, lines: o.lines });
  }));

  r.post("/enquiries", writeLimit, h(async (req, res) => {
    const q = validateEnquiry(req.body, now());
    const code = await uniqueCode(db, "enquiries", "CK");
    await db.query(
      `INSERT INTO enquiries (code, name, phone, occasion, flavour, kg, eggless, pickup_date, message, notes, estimate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [code, q.name, q.phone, q.occasion, q.flavour, q.kg, q.eggless, q.date, q.message, q.notes, q.estimate]
    );
    res.status(201).json({ code, ...q, phone: undefined });
  }));

  return r;
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof InputError) return res.status(400).json({ error: err.message, field: err.field });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "The request couldn't be read." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "The request is too large." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}
