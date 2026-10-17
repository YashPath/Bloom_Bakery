import crypto from "node:crypto";

// A small signed-cookie session for a single admin. No extra packages needed.
// Cookie value: "<expiry ms>.<HMAC of expiry>"

const COOKIE = "bb_admin";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const sign = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

export function passwordMatches(given, expected) {
  // Hash both sides first so timingSafeEqual always compares equal-length buffers.
  return crypto.timingSafeEqual(sha(given), sha(expected));
}

export function issueCookie(res, secret, secure) {
  const exp = String(Date.now() + TTL_MS);
  res.cookie(COOKIE, `${exp}.${sign(secret, exp)}`, {
    httpOnly: true, sameSite: "strict", secure, maxAge: TTL_MS, path: "/",
  });
}

export function clearCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function readCookie(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function isAdmin(req, secret) {
  const value = readCookie(req);
  if (!value) return false;
  const [exp, mac] = value.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = sign(secret, exp);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export const requireAdmin = (secret) => (req, res, next) =>
  isAdmin(req, secret) ? next() : res.status(401).json({ error: "Log in to continue." });
