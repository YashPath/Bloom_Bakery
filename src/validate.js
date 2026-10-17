import { SHOP, CAKE, FESTIVE, cakeEstimate } from "./config.js";
import { parseIstDateTime, parseIstDate, istToday, fmtWall, DAY_MS } from "./time.js";

export class InputError extends Error {
  constructor(message, field) { super(message); this.field = field; }
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

function name(v) {
  const n = clean(v, 60);
  if (n.length < 2) throw new InputError("Enter your name so we know whose order it is.", "name");
  return n;
}

function phone(v) {
  const p = String(v ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(p)) throw new InputError("Enter a 10-digit mobile number starting with 6, 7, 8 or 9.", "phone");
  return p;
}

export function validateOrder(body, menuById, now = Date.now()) {
  const out = { name: name(body?.name), phone: phone(body?.phone) };

  const slot = parseIstDateTime(body?.pickup);
  if (!slot) throw new InputError("Choose a pickup time.", "pickup");
  if (slot.weekday === SHOP.closedWeekday) throw new InputError("We're closed on Mondays. Choose another day.", "pickup");
  if (slot.minutes < SHOP.openMin || slot.minutes > SHOP.lastSlotMin || slot.minutes % SHOP.slotStepMin)
    throw new InputError("Pickup slots run every 30 minutes from 8:00 to 20:30.", "pickup");
  const lead = slot.instant.getTime() - now;
  if (lead < SHOP.minLeadMin * 60 * 1000) throw new InputError("That slot is too soon. Choose one at least 30 minutes away.", "pickup");
  if (lead > SHOP.maxDaysAhead * DAY_MS) throw new InputError("Pickup orders can be placed up to 7 days ahead.", "pickup");
  out.pickupAt = fmtWall(slot.wall);

  const raw = Array.isArray(body?.items) ? body.items : [];
  if (!raw.length) throw new InputError("Your order is empty.", "items");
  if (raw.length > SHOP.maxLinesPerOrder) throw new InputError("That's too many different items for one order.", "items");

  const festiveClosed = now > parseIstDateTime(FESTIVE.ordersClose).instant.getTime();
  const merged = new Map();
  for (const line of raw) {
    const item = menuById.get(String(line?.id));
    const qty = Number(line?.qty);
    if (!item) throw new InputError("One of the items is no longer on the menu. Refresh the page and try again.", "items");
    if (!Number.isInteger(qty) || qty < 1) throw new InputError("Quantities must be whole numbers.", "items");
    if (item.sold_out) throw new InputError(`${item.name} has sold out for today. Remove it to continue.`, "items");
    if (item.category === "Diwali" && festiveClosed) throw new InputError("Diwali box orders have closed.", "items");
    merged.set(item.id, (merged.get(item.id) || 0) + qty);
  }
  out.lines = [...merged].map(([id, qty]) => {
    if (qty > SHOP.maxQtyPerItem) throw new InputError(`For more than ${SHOP.maxQtyPerItem} of one item, call us and we'll bake extra.`, "items");
    const item = menuById.get(id);
    return { id, name: item.name, unitPrice: item.price, qty };
  });
  // The total always comes from our own prices, never from the browser.
  out.total = out.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return out;
}

export function validateEnquiry(body, now = Date.now()) {
  const out = { name: name(body?.name), phone: phone(body?.phone) };

  out.occasion = CAKE.occasions.includes(body?.occasion) ? body.occasion : "Something else";

  const flavour = CAKE.flavours.find((f) => f.name === body?.flavour);
  if (!flavour) throw new InputError("Choose a flavour.", "flavour");
  if (!flavour.perKg) throw new InputError(`${flavour.name.split(",")[0]} isn't available right now.`, "flavour");
  out.flavour = flavour.name;

  const size = CAKE.sizes.find((s) => s.kg === Number(body?.kg));
  if (!size) throw new InputError("Choose a size.", "kg");
  out.kg = size.kg;

  const d = parseIstDate(body?.date);
  if (!d) throw new InputError("Choose a pickup date.", "date");
  const earliest = new Date(istToday(now).getTime() + CAKE.minNoticeDays * DAY_MS);
  if (d.wall < earliest) throw new InputError(`Custom cakes need 48 hours. The earliest pickup is ${fmtWall(earliest, false)}.`, "date");
  if (d.wall.getTime() > istToday(now).getTime() + CAKE.maxDaysAhead * DAY_MS) throw new InputError("We take cake enquiries up to 90 days ahead.", "date");
  if (d.weekday === SHOP.closedWeekday) throw new InputError("We're closed on Mondays. Choose another day.", "date");
  out.date = fmtWall(d.wall, false);

  out.eggless = !!body?.eggless;
  out.message = clean(body?.message, CAKE.messageMax);
  out.notes = clean(body?.notes, CAKE.notesMax);
  out.estimate = cakeEstimate(flavour.perKg, size.kg);
  return out;
}
