// Business rules live here so the API and the frontend agree on them.

export const SHOP = {
  openMin: 8 * 60,          // 08:00
  lastSlotMin: 20 * 60 + 30, // last pickup slot 20:30 (shop closes 21:00)
  closedWeekday: 1,          // Monday (0 = Sunday)
  slotStepMin: 30,
  minLeadMin: 30,            // pickup must be at least 30 minutes away
  maxDaysAhead: 7,
  maxQtyPerItem: 20,
  maxLinesPerOrder: 20,
};

export const CAKE = {
  minNoticeDays: 2,  // 48 hours
  maxDaysAhead: 90,
  messageMax: 30,
  notesMax: 500,
  occasions: ["Birthday", "Anniversary", "Wedding", "Baby shower", "Office celebration", "Something else"],
  // price per kg in rupees; 0 means not available right now
  flavours: [
    { name: "Rasmalai", perKg: 1900 },
    { name: "Chocolat noir", perKg: 2100 },
    { name: "Raspberry & rose", perKg: 2000 },
    { name: "Vanilla & seasonal fruit", perKg: 1700 },
    { name: "Alphonso & vanilla, returns in April", perKg: 0 },
  ],
  sizes: [
    { kg: 0.5, serves: "4 to 6" },
    { kg: 1, serves: "8 to 10" },
    { kg: 1.5, serves: "12 to 15" },
    { kg: 2, serves: "16 to 20" },
    { kg: 3, serves: "25 to 30" },
  ],
};

export const FESTIVE = {
  ordersClose: "2026-11-05T21:00",
  pickupEnd: "2026-11-08T21:00",
};

export const cakeEstimate = (perKg, kg) => Math.round((perKg * kg) / 50) * 50;
