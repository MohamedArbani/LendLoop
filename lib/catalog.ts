export const categories = [
  "Power tools",
  "Garden",
  "Kitchen",
  "Camping",
  "Hand tools",
  "Other",
] as const;
export const conditions = ["Like new", "Good", "Well used"] as const;
export type Category = (typeof categories)[number];
export type Condition = (typeof conditions)[number];
export type BookingRange = { start: string; end: string };

export function overlapsBooking(ranges: readonly BookingRange[], start: string, end: string) {
  return ranges.some((range) => range.start <= end && range.end >= start);
}

export function formatBookingDay(day: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    Date.parse(day),
  );
}

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && utcDay(time) === value;
}
