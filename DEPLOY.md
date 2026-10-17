# Deploy guide (Hinglish)

Main raasta **Render (free)** hai: free web service + free Postgres database. `render.yaml` dono ko apne aap bana ke jod deta hai.

---

## Step 0: Pehle apne laptop pe chala ke dekho (5 minute)

Node.js 20 ya usse naya chahiye. Check karo: `node -v`

```bash
npm install
npm start
```

- Shop: http://localhost:3000
- Admin: http://localhost:3000/admin (password: `bloom-admin`)

Laptop pe Postgres install karne ki zaroorat nahi. App khud PGlite chalati hai (Node ke andar chalne wala Postgres) aur data `data/pglite` folder mein save karti hai.

Ek order place karo, phir admin mein dekho ki aaya ya nahi. Tests ke liye `npm test` chalao, 10 pass hone chahiye.

---

## Step 1: GitHub pe daalo

1. github.com pe naya repository banao, naam `bloom-bakery`. README **mat** add karna, wo pehle se hai.
2. Project folder mein terminal kholo aur ye chalao:

```bash
git init
git add .
git commit -m "Bloom Bakery: storefront, ordering API and admin dashboard"
git branch -M main
git remote add origin https://github.com/<tumhara-username>/bloom-bakery.git
git push -u origin main
```

`.gitignore` already `node_modules`, `.env` aur local `data` folder ko bahar rakhta hai.

---

## Step 2: Render pe deploy (free)

1. **render.com** pe GitHub se sign up ya login karo.
2. Dashboard pe **New → Blueprint** dabao.
3. Apna `bloom-bakery` repo connect karo. Render `render.yaml` padh ke 2 cheezein dikhayega:
   - `bloom-db`: free Postgres database
   - `bloom-bakery`: free web service
4. Wo tumse **`ADMIN_PASSWORD`** maangega. Koi strong password daalo, isi se admin login hoga.
   Baaki sab (`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`) apne aap set ho jaata hai.
5. **Apply** dabao. Pehli baar build mein 3–5 minute lagte hain.
6. `bloom-bakery` service kholo. Upar ek link dikhega, jaise **`https://bloom-bakery.onrender.com`**. Yahi tumhari live site hai.
7. `https://<tumhara-link>/admin` kholo aur apne password se login karo.

Dono services **Singapore** region mein banti hain, jo India ke sabse paas hai.

**Kuch change karna ho toh:** code edit karo, phir `git add . && git commit -m "..." && git push` chalao. Render apne aap naya version deploy kar dega. Database ka data waise hi rehta hai.

---

## Render free plan ki 2 baatein (zaroor padho)

(Render ki docs ke hisaab se, October 2026: render.com/docs/free)

1. **Site 15 minute baad so jaati hai.** Agar 15 minute tak koi visit na kare, toh agle visit pe site khulne mein lagbhag 1 minute lagta hai. Portfolio demo ke liye ye chalta hai. Interview se pehle ek baar link khol ke site jaga dena.
2. **Free database 30 din baad expire hota hai.** Uske baad 14 din ka grace period milta hai. Us dauraan ya toh database ko paid plan pe upgrade karo, ya naya free database bana ke jod do:
   - Render dashboard → `bloom-db` delete karo → **New → Blueprint** → wahi repo chuno. Render naya `bloom-db` bana ke service se jod dega.
   - Menu apne aap wapas aa jaata hai, sirf purane test orders jaate hain.

   Data permanent chahiye toh `DATABASE_URL` mein Neon ya Supabase ka free Postgres URL daal do. Code kuch nahi badalna padega, SSL apne aap lag jaata hai.

---

## Deploy ke baad checklist

- [ ] Shop khulti hai aur menu load hota hai
- [ ] Ek test order place hota hai aur `BB-xxxx` code milta hai
- [ ] `/admin` mein login hota hai aur wo order dikhta hai
- [ ] Order ko "Mark ready" karke dekha
- [ ] Ek item ko sold out kiya, shop pe "Sold out" dikha, phir wapas available kiya
- [ ] Ek baar redeploy kiya (Manual Deploy → Deploy latest commit) aur order phir bhi wahan tha
- [ ] Test orders ko Cancel kar diya, taaki dashboard saaf dikhe

## Kuch galat ho toh

| Problem | Kya karo |
|---|---|
| Logs mein "Set the ADMIN_PASSWORD variable" | Service → Environment → `ADMIN_PASSWORD` add karo → Save. Render apne aap restart kar dega. |
| "Couldn't start: ... connect" ya database error | Check karo ki `bloom-db` ka status "Available" hai aur service ke Environment mein `DATABASE_URL` hai. |
| Site bahut der se khul rahi hai | Free plan pe site so rahi thi. 1 minute ruko, phir khul jaayegi. |
| Admin login hota hai par turant logout ho jaata hai | Site `https://` pe kholo. Production mein cookie sirf HTTPS pe chalti hai. |
| "Too many requests" | Rate limit laga hai: 10 minute mein 20 orders, aur 15 minute mein 10 login. Thoda ruk ke try karo. |
| Build fail, Node version error | Environment mein `NODE_VERSION` = `20` hona chahiye. `render.yaml` ye already set karta hai. |

---

## Doosre options

**Railway:** New Project → Deploy from GitHub repo. Variables mein `ADMIN_PASSWORD` aur `NODE_ENV=production` daalo. Database ke liye ya toh Railway ka Postgres add karo (wo `DATABASE_URL` khud de deta hai), ya `/data` pe Volume lagao (tab app PGlite use karegi). Phir Settings → Networking → Generate Domain.

**Docker (kisi bhi VPS pe):**

```bash
docker build -t bloom-bakery .
docker run -d --name bloom -p 3000:3000 \
  -e ADMIN_PASSWORD='tumhara-password' \
  -v bloom-data:/data \
  --restart unless-stopped bloom-bakery
```

Postgres use karna ho toh `-e DATABASE_URL=postgres://...` bhi add kar do.

---

## Portfolio mein kaise lagao

- Live link: Render wala `onrender.com` domain
- GitHub link: repo
- Ek line: *"Full-stack patisserie site with pickup ordering, custom cake enquiries and a staff dashboard. Node.js, Express, PostgreSQL. Server-side pricing, IST-aware scheduling, CSP and rate limiting, tests on real Postgres."*
- Recruiters ke liye: README mein likh do ki demo admin dekhna ho toh tumse password maang lein. Asli password public mat karna.
