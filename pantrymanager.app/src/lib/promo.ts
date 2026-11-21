import { roundMoney } from "./money";

// Promociones de un renglón. Las mismas reglas están en PromoCalculator.cs del API:
// si se cambia una hay que cambiar la otra.
//  nxm:     lleva `buy` y paga `value` (2x1: buy 2, value 1; 3x2: buy 3, value 2)
//  pack:    `buy` por un precio total de `value` (2 por $50)
//  second:  el segundo de cada par con `value` % de descuento (2º al 50%)
//  percent: `value` % de descuento en todo
export type PromoType = "nxm" | "pack" | "second" | "percent";

export interface Promo {
  type: PromoType;
  buy?: number;
  value: number;
}

export const PROMO_OPTIONS: { type: PromoType; label: string }[] = [
  { type: "nxm", label: "Lleva N paga M (2x1, 3x2)" },
  { type: "pack", label: "N por un precio (2 por $50)" },
  { type: "second", label: "Segundo con descuento (2º al 50%)" },
  { type: "percent", label: "Porcentaje de descuento" },
];

export function isValidPromo(promo: Promo): boolean {
  const { type, buy, value } = promo;
  if (!Number.isFinite(value)) return false;

  switch (type) {
    case "nxm":
      return Number.isInteger(buy) && (buy as number) >= 2 && value >= 1 && value < (buy as number);
    case "pack":
      return Number.isInteger(buy) && (buy as number) >= 2 && value > 0;
    case "second":
    case "percent":
      return value > 0 && value < 100;
    default:
      return false;
  }
}

// Importe del renglón con la promoción. Lo que no completa un grupo se cobra a precio normal.
export function promoTotal(quantity: number, unitPrice: number, promo?: Promo): number {
  if (!promo || !isValidPromo(promo)) return roundMoney(quantity * unitPrice);

  const { type, buy = 1, value } = promo;

  switch (type) {
    case "nxm": {
      const groups = Math.floor(quantity / buy);
      return roundMoney((groups * value + (quantity - groups * buy)) * unitPrice);
    }
    case "pack": {
      const groups = Math.floor(quantity / buy);
      return roundMoney(groups * value + (quantity - groups * buy) * unitPrice);
    }
    case "second": {
      const pairs = Math.floor(quantity / 2);
      return roundMoney(pairs * (unitPrice + unitPrice * (1 - value / 100)) + (quantity - pairs * 2) * unitPrice);
    }
    case "percent":
      return roundMoney(quantity * unitPrice * (1 - value / 100));
  }
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

// Texto corto para mostrar en el carrito y en el historial.
export function promoLabel(promo: Promo): string {
  switch (promo.type) {
    case "nxm":
      return `${promo.buy}x${num(promo.value)}`;
    case "pack":
      return `${promo.buy} por $${num(promo.value)}`;
    case "second":
      return `2º al ${num(promo.value)}%`;
    case "percent":
      return `${num(promo.value)}% menos`;
  }
}
