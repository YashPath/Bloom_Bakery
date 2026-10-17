# Bloom Bakery

A patisserie website with real pickup ordering, custom cake enquiries and a counter dashboard for the shop staff.
Built with Node.js, Express and PostgreSQL. The frontend is plain HTML, CSS and JavaScript with no framework.

> Portfolio project by Yash Pathak. Bloom Bakery is a fictional business.

## What it does

**For customers** (`/`)
- Menu with categories, an eggless filter, allergens on every item and live "sold out" status
- Pickup ordering with 30-minute slots that follow the shop's hours (closed Mondays, 30 minutes' lead time)
- Diwali gift boxes with a countdown that closes orders on the right date
- Custom cake enquiry form with a live price estimate, 48-hour notice rule and message counter
- Open-now status, worked out in India time wherever the visitor is

**For staff** (`/admin`)
- Password login with a signed, HTTP-only cookie
- Today's summary: pickups, orders still to prepare, takings, new cake enquiries
- Order queue by pickup time: mark ready, collected or cancelled
- Cake enquiries: confirm or decline
- Mark any item sold out, and the shop stops taking orders for it immediately
- Refreshes every 30 seconds

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then set ADMIN_PASSWORD and SESSION_SECRET
npm start
```

Open http://localhost:3000 for the shop and http://localhost:3000/admin for the dashboard.
Without a `.env`, development mode uses the admin password `bloom-admin`.
Locally you don't need to install Postgres: without `DATABASE_URL` the app uses [PGlite](https://pglite.dev), real Postgres running inside Node, saved in `./data/pglite`.

**Deploying?** Follow [DEPLOY.md](DEPLOY.md). Render (free) is the main path, with Railway and Docker as alternatives.

Run the tests:

```bash
npm test                                          # on PGlite
TEST_DATABASE_URL=postgres://... npm test         # the same tests against a real Postgres server
```

## How it's built

```
src/
  server.js        Express app, security headers, static files
  db.js            Postgres schema, seed menu, and one interface over pg and PGlite
  config.js        Shop hours, cake flavours, sizes and festive dates in one place
  validate.js      Every rule the API enforces on orders and enquiries
  time.js          India-time helpers so the shop works on a UTC server
  auth.js          Signed-cookie admin session, no extra packages
  routes/
    public.js      /api/menu, /api/orders, /api/enquiries
    admin.js       /api/admin/* (login, orders, enquiries, stock)
public/
  index.html       The shop
  app.js           Shop script
  admin.html       Counter dashboard
  admin.js         Dashboard script
test/
  api.test.js      10 API tests using Node's built-in test runner
```

### Decisions worth pointing out

- **Prices are never trusted from the browser.** The client sends item IDs and quantities only. The server looks up prices, merges duplicate lines, checks stock and computes the total.
- **India time on any server.** Hosts usually run in UTC. `time.js` converts so that "Today, 12:30" and "closed on Mondays" mean the same thing to the shop, the customer and the server.
- **One SQL dialect everywhere.** Production uses Postgres through `pg`; local runs and tests use PGlite. Same schema, same queries, no SQLite-to-Postgres surprises at deploy time.
- **Order lines copy the name and price** at the time of ordering, so changing the menu later doesn't rewrite old orders.
- **Security:** Helmet with a strict Content Security Policy (no inline scripts), rate limits on orders, enquiries and login, parameterised SQL, a 20 KB body limit, constant-time password and cookie checks, and HTML escaping of everything users type.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/menu` | Menu items, cake flavours and sizes, shop hours |
| POST | `/api/orders` | `{ name, phone, pickup: "YYYY-MM-DDTHH:MM", items: [{ id, qty }] }` → order code and total |
| POST | `/api/enquiries` | `{ name, phone, occasion, flavour, kg, eggless, date: "YYYY-MM-DD", message, notes }` → reference and estimate |
| POST | `/api/admin/login` | `{ password }` → sets session cookie |
| GET | `/api/admin/summary` | Today's counts and takings |
| GET | `/api/admin/orders?day=&status=` | Orders with their items |
| PATCH | `/api/admin/orders/:id` | `{ status: "pending" \| "ready" \| "collected" \| "cancelled" }` |
| GET | `/api/admin/enquiries?status=` | Cake enquiries |
| PATCH | `/api/admin/enquiries/:id` | `{ status: "new" \| "confirmed" \| "declined" }` |
| PATCH | `/api/admin/menu/:id` | `{ soldOut: true \| false }` |

Errors come back as `{ error, field }` with status 400, so the form can highlight the right input.

## Deploying

- **Render (free):** `render.yaml` creates a free web service and a free Render Postgres database and connects them. You only type the admin password. The free database expires after 30 days, and the free service sleeps after 15 idle minutes.
- **Any Postgres** (Neon, Supabase, Railway Postgres): set `DATABASE_URL`. SSL is switched on automatically for hosted databases.
- **Without Postgres:** PGlite saves to `/data/pglite` when a disk is mounted at `/data` (Railway volume, Docker volume).

Set these on the host: `NODE_ENV=production` and `ADMIN_PASSWORD` (required). `SESSION_SECRET` is recommended so admin logins survive restarts. See [DEPLOY.md](DEPLOY.md).

## What I'd add next

- SMS or WhatsApp confirmation when an order is marked ready
- Online payment with Razorpay
- Menu editing from the dashboard (prices, new items, photos)
- Daily sales report export
