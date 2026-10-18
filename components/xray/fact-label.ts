/** Short chip text for an X-ray fact (GH-9): `washer: true` → "Washer", `beds_counted: 2` → "2 beds counted". */

const TITLES: Record<string, string> = {
  has_desk: "Desk",
  desk_near_window: "Desk by a window",
  stairs: "Stairs",
  step_free_entrance: "Step-free entrance",
  kitchen_equipment: "Kitchen",
  outdoor_space: "Outdoor space",
  view_type: "View",
  natural_light: "Natural light",
  washer: "Washer",
  tv: "TV",
  workspace: "Workspace",
  parking_visible: "Parking",
  fireplace: "Fireplace",
};

function title(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return TITLES[key] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

export function factLabel(key: string, value: string | number | boolean): string {
  if (key === "beds_counted" && typeof value === "number")
    return `${value} ${value === 1 ? "bed" : "beds"} counted`;
  if (key === "sleeping_spots" && typeof value === "number")
    return `${value} sleeping ${value === 1 ? "spot" : "spots"}`;
  if (value === true) return title(key);
  if (value === false) return `No ${title(key).toLowerCase()} seen`;
  return `${title(key)}: ${String(value).trim()}`;
}
