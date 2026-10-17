import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { publicRoutes, errorHandler } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env without an extra package (only sets values that aren't already set).
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// db comes from `await openDb()`; see the bottom of this file.
export function createApp({ db, password = process.env.ADMIN_PASSWORD, secret = process.env.SESSION_SECRET, now } = {}) {
  if (!db) throw new Error("createApp needs a database. Pass { db: await openDb() }.");
  const production = process.env.NODE_ENV === "production";
  if (!password || password === "change-this-password") {
    if (production) throw new Error("Set the ADMIN_PASSWORD variable on your host before starting in production.");
    password = "bloom-admin";
    console.warn("Using the development admin password: bloom-admin");
  }
  if (!secret || secret === "replace-with-a-long-random-string") {
    // Without a fixed secret, admin logins simply reset when the server restarts.
    secret = crypto.randomBytes(32).toString("hex");
    if (production) console.warn("SESSION_SECRET not set. Generated one for this run; admins will need to log in again after a restart.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // correct client IPs for rate limiting behind Render/Railway proxies

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: "20kb" }));

  app.use("/api", publicRoutes(db, now ? { now } : {}));
  app.use("/api/admin", adminRoutes(db, { password, secret, secureCookie: production, ...(now ? { now } : {}) }));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  app.get("/admin", (_req, res) => res.sendFile(path.join(root, "public", "admin.html")));
  app.use(express.static(path.join(root, "public"), { maxAge: production ? "7d" : 0, index: "index.html" }));
  app.use(errorHandler);
  return app;
}

// Start the server when run directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  try {
    const db = await openDb();
    console.log(db.kind === "postgres" ? "Database: Postgres (DATABASE_URL)" : "Database: PGlite, saved in ./data/pglite (set DATABASE_URL to use Postgres)");
    const server = createApp({ db }).listen(port, "0.0.0.0", () => {
      console.log(`Bloom Bakery running at http://localhost:${port}`);
      console.log(`Admin dashboard at  http://localhost:${port}/admin`);
    });
    const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  } catch (e) {
    console.error("Couldn't start:", e.message);
    process.exit(1);
  }
}
