// Tailwind chip classes for an item's type, with a neutral fallback for unknown
// types. Shared by every place that renders an item-type badge.
const TYPE_CHIP_CLASSES: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}

const FALLBACK = 'bg-slate-700 text-slate-300'

export function itemTypeChipClass(type: string | null | undefined): string {
  return (type && TYPE_CHIP_CLASSES[type]) || FALLBACK
}
