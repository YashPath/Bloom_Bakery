import express from "express";
import rateLimit from "express-rate-limit";
import { passwordMatches, issueCookie, clearCookie, isAdmin, requireAdmin } from "../auth.js";
import { istToday, fmtWall } from "../time.js";
import { h } from "./public.js";

const ORDER_STATUSES = ["pending", "ready", "collected", "cancelled"];
const ENQUIRY_STATUSES = ["new", "confirmed", "declined"];
const validId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

export function adminRoutes(db, { password, secret, secureCookie, now = () => Date.now() }) {
  const r = express.Router();
  const guard = requireAdmin(secret);

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: "Too many login attempts. Wait 15 minutes and try again." },
  });

  r.post("/login", loginLimit, (req, res) => {
    if (!passwordMatches(req.body?.password ?? "", password)) return res.status(401).json({ error: "That password is incorrect." });
    issueCookie(res, secret, secureCookie);
    res.json({ ok: true });
  });

  r.post("/logout", (_req, res) => { clearCookie(res); res.json({ ok: true }); });
  r.get("/session", (req, res) => res.json({ loggedIn: isAdmin(req, secret) }));

  r.use(guard);

  r.get("/summary", h(async (_req, res) => {
    const today = fmtWall(istToday(now()), false);
    const [s] = await db.query(`SELECT
        COUNT(*)::int AS orders,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total END), 0)::int AS revenue,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'ready')::int AS ready
      FROM orders WHERE substr(pickup_at, 1, 10) = $1`, [today]);
    const [{ n }] = await db.query("SELECT COUNT(*)::int AS n FROM enquiries WHERE status = 'new'");
    res.json({ today, ...s, newEnquiries: n });
  }));

  r.get("/orders", h(async (req, res) => {
    const where = [], args = [];
    if (ORDER_STATUSES.includes(req.query.status)) { args.push(req.query.status); where.push(`o.status = $${args.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.day || "")) { args.push(req.query.day); where.push(`substr(o.pickup_at, 1, 10) = $${args.length}`); }
    // One query: each order with its lines bundled as JSON.
    const rows = await db.query(`
      SELECT o.*,
        COALESCE(json_agg(json_build_object('name', i.name, 'unit_price', i.unit_price, 'qty', i.qty) ORDER BY i.name)
                 FILTER (WHERE i.order_id IS NOT NULL), '[]'::json) AS items
      FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY o.id
      ORDER BY o.pickup_at ASC, o.id ASC
      LIMIT 200`, args);
    res.json(rows.map((o) => ({ ...o, items: typeof o.items === "string" ? JSON.parse(o.items) : o.items })));
  }));

  r.patch("/orders/:id", h(async (req, res) => {
    const status = req.body?.status, id = validId(req.params.id);
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
    if (!id) return res.status(404).json({ error: "Order not found." });
    const rows = await db.query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING id", [status, id]);
    if (!rows.length) return res.status(404).json({ error: "Order not found." });
    res.json({ ok: true, status });
  }));

  r.get("/enquiries", h(async (req, res) => {
    const status = ENQUIRY_STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = await db.query(`SELECT * FROM enquiries ${status ? "WHERE status = $1" : ""}
      ORDER BY pickup_date ASC, id ASC LIMIT 200`, status ? [status] : []);
    res.json(rows);
  }));

  r.patch("/enquiries/:id", h(async (req, res) => {
    const status = req.body?.status, id = validId(req.params.id);
    if (!ENQUIRY_STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
    if (!id) return res.status(404).json({ error: "Enquiry not found." });
    const rows = await db.query("UPDATE enquiries SET status = $1 WHERE id = $2 RETURNING id", [status, id]);
    if (!rows.length) return res.status(404).json({ error: "Enquiry not found." });
    res.json({ ok: true, status });
  }));

  r.get("/menu", h(async (_req, res) => res.json(await db.query("SELECT id, category, name, price, sold_out FROM menu_items ORDER BY sort"))));

  r.patch("/menu/:id", h(async (req, res) => {
    const soldOut = !!req.body?.soldOut;
    const rows = await db.query("UPDATE menu_items SET sold_out = $1 WHERE id = $2 RETURNING id", [soldOut, String(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: "Item not found." });
    res.json({ ok: true, soldOut });
  }));

  return r;
}
