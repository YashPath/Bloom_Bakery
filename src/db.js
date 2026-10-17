import fs from "node:fs";
import path from "node:path";

export const SEED_MENU = [
  ["rasmalai", "Cakes", "Rasmalai entremet", "Saffron sponge, rabri mousse, cardamom and crushed pistachio.", "750 g", 1450, 1, "nuts, dairy, gluten"],
  ["noir", "Cakes", "Chocolat noir", "Seventy per cent ganache, hazelnut praline, cocoa sablé base.", "750 g", 1650, 1, "nuts, dairy, gluten"],
  ["rasp", "Cakes", "Raspberry & rose dome", "Raspberry mousse, rose crémeux, almond dacquoise. Single serve.", "140 g", 420, 0, "nuts, dairy, egg"],
  ["tart", "Pastries", "Saffron pistachio tart", "Pistachio frangipane under a saffron crème, in a sweet pastry shell.", "110 g", 320, 0, "nuts, dairy, gluten, egg"],
  ["crois", "Pastries", "Butter croissant", "Laminated with cultured butter over three days.", "80 g", 180, 0, "dairy, gluten, egg"],
  ["meringue", "Pastries", "Burnt meringue tartlet", "Cocoa sablé, salted caramel, torched Swiss meringue.", "95 g", 290, 0, "dairy, gluten, egg"],
  ["sour", "Breads", "Country sourdough", "Wholewheat levain, fourteen-hour cold proof.", "850 g", 380, 1, "gluten"],
  ["brioche", "Breads", "Brioche loaf", "Rich with butter and eggs, for toast and bread pudding.", "500 g", 340, 0, "dairy, gluten, egg"],
  ["focaccia", "Breads", "Olive & rosemary loaf", "Kalamata olives, flaky salt, rosemary from our own pots.", "450 g", 290, 1, "gluten"],
  ["ccc", "Cookies", "Brown butter chocolate chip", "Browned butter, 55% dark chocolate, soft in the middle. Box of six.", "300 g", 450, 0, "dairy, gluten, egg"],
  ["nankhatai", "Cookies", "Ghee nankhatai", "Desi ghee, besan and green cardamom. Box of twelve.", "240 g", 360, 1, "dairy, gluten"],
  ["macaron", "Cookies", "Rose & lychee macarons", "Almond shells with rose ganache and a lychee centre. Box of six.", "90 g", 540, 0, "nuts, dairy, egg"],
  ["dw-box", "Diwali", "Patisserie Diwali box", "Nine pieces: saffron pistachio financiers, rose and lychee macarons, ghee nankhatai.", "420 g", 1250, 0, "nuts, dairy, gluten, egg"],
  ["dw-bonbon", "Diwali", "Diya bonbons", "Twelve hand-painted dark chocolate bonbons filled with kesar, paan and salted caramel.", "180 g", 980, 1, "nuts, dairy"],
  ["dw-cake", "Diwali", "Orange & dry fruit cake", "Candied orange, figs, apricots and cashews, baked in a gift tin. Keeps for two weeks.", "700 g", 1100, 1, "nuts, dairy, gluten"],
];

// Postgres schema. Runs on every start; IF NOT EXISTS keeps it safe to repeat.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    weight      TEXT NOT NULL,
    price       INTEGER NOT NULL CHECK (price > 0),
    eggless     BOOLEAN NOT NULL DEFAULT FALSE,
    allergens   TEXT NOT NULL DEFAULT '',
    sold_out    BOOLEAN NOT NULL DEFAULT FALSE,
    sort        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    pickup_at   TEXT NOT NULL,              -- IST wall time, "YYYY-MM-DD HH:MM"
    total       INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','ready','collected','cancelled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    name        TEXT NOT NULL,              -- copied so old orders keep their names and prices
    unit_price  INTEGER NOT NULL,
    qty         INTEGER NOT NULL CHECK (qty > 0)
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    occasion    TEXT NOT NULL,
    flavour     TEXT NOT NULL,
    kg          DOUBLE PRECISION NOT NULL,
    eggless     BOOLEAN NOT NULL DEFAULT FALSE,
    pickup_date TEXT NOT NULL,              -- IST date, "YYYY-MM-DD"
    message     TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    estimate    INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','confirmed','declined')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, pickup_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status, pickup_date);
`;

// Hosted databases reached over the internet need SSL; Render's internal URL (no dots in the host) does not.
function sslFor(url) {
  if (process.env.PGSSL === "false") return undefined;
  if (process.env.PGSSL === "true") return { rejectUnauthorized: false };
  const host = new URL(url).hostname;
  return host.includes(".") && !["localhost", "127.0.0.1"].includes(host) ? { rejectUnauthorized: false } : undefined;
}

// Without DATABASE_URL, use PGlite: real Postgres running inside Node, saved in a folder.
function defaultLiteDir() {
  if (process.env.PGLITE_DIR) return process.env.PGLITE_DIR;
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH || (fs.existsSync("/data") ? "/data" : null);
  return mount ? path.join(mount, "pglite") : "./data/pglite";
}

// Every database is wrapped in the same small interface:
//   query(sql, params) -> rows     tx(async t => ...) -> result     exec(sql)     close()
export async function openDb({ url = process.env.DATABASE_URL, memory = false, dir = defaultLiteDir() } = {}) {
  let db;
  if (url && !memory) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: 5, idleTimeoutMillis: 30000 });
    pool.on("error", (e) => console.error("Postgres connection error:", e.message));
    db = {
      kind: "postgres",
      query: (sql, params) => pool.query(sql, params).then((r) => r.rows),
      exec: (sql) => pool.query(sql),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn({ query: (s, p) => client.query(s, p).then((r) => r.rows) });
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    let lite;
    if (memory) lite = new PGlite();
    else { fs.mkdirSync(path.resolve(dir), { recursive: true }); lite = new PGlite(path.resolve(dir)); }
    db = {
      kind: "pglite",
      query: (sql, params) => lite.query(sql, params).then((r) => r.rows),
      exec: (sql) => lite.exec(sql),
      tx: (fn) => lite.transaction((t) => fn({ query: (s, p) => t.query(s, p).then((r) => r.rows) })),
      close: () => lite.close(),
    };
  }

  await db.exec(SCHEMA);
  const [{ n }] = await db.query("SELECT COUNT(*)::int AS n FROM menu_items");
  if (n === 0) {
    await db.tx(async (t) => {
      for (const [i, [id, cat, name, desc, weight, price, eggless, allergens]] of SEED_MENU.entries()) {
        await t.query(
          "INSERT INTO menu_items (id, category, name, description, weight, price, eggless, allergens, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [id, cat, name, desc, weight, price, !!eggless, allergens, i]
        );
      }
    });
  }
  return db;
}
