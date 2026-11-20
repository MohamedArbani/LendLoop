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

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && utcDay(time) === value;
}
