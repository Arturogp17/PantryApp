import { PurchaseItemInput } from "../types";
import { roundMoney, roundQuantity } from "./money";
import { Promo, promoTotal } from "./promo";

// Un renglón del carrito local. El producto puede no existir todavía en el servidor
// (productId null): se crea al registrar la compra.
export interface CartLine {
  key: string;
  productId: number | null;
  name: string;
  barcode: string | null;
  stockType: number;
  quantity: number;
  unitPrice: number;
  promo?: Promo;
  imageUrl?: string | null;
}

export type NewCartLine = Omit<CartLine, "key">;

export const lineKey = (p: {
  productId: number | null;
  barcode?: string | null;
  name: string;
}): string => {
  if (p.productId !== null) return `p:${p.productId}`;
  if (p.barcode) return `b:${p.barcode}`;
  return `n:${p.name.trim().toLowerCase()}`;
};

export const lineTotal = (line: Pick<CartLine, "quantity" | "unitPrice" | "promo">): number =>
  promoTotal(line.quantity, line.unitPrice, line.promo);

// Suma de los renglones ya redondeados, igual que el servidor, para que el total
// coincida con lo que se ve renglón por renglón.
export const itemsTotal = (lines: Pick<CartLine, "quantity" | "unitPrice" | "promo">[]): number =>
  roundMoney(lines.reduce((acc, l) => acc + lineTotal(l), 0));

export const cartTotal = (lines: CartLine[]): number => itemsTotal(lines);

// Lo que se ahorra en el renglón por la promoción.
export const lineSavings = (line: Pick<CartLine, "quantity" | "unitPrice" | "promo">): number =>
  roundMoney(roundMoney(line.quantity * line.unitPrice) - lineTotal(line));

// Si el producto ya estaba en el carrito se suma la cantidad y se queda el precio nuevo.
export function addLine(lines: CartLine[], line: NewCartLine): CartLine[] {
  const key = lineKey(line);
  const existing = lines.find((l) => l.key === key);

  if (!existing) {
    return [...lines, { ...line, key, quantity: roundQuantity(line.quantity) }];
  }

  return lines.map((l) =>
    l.key === key
      ? {
          ...l,
          quantity: roundQuantity(l.quantity + line.quantity),
          unitPrice: line.unitPrice,
          promo: line.promo ?? l.promo,
        }
      : l
  );
}

export function updateLine(
  lines: CartLine[],
  key: string,
  patch: Partial<Pick<CartLine, "quantity" | "unitPrice" | "promo">>
): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, ...patch } : l));
}

export const removeLine = (lines: CartLine[], key: string): CartLine[] =>
  lines.filter((l) => l.key !== key);

export const toPurchaseItems = (lines: CartLine[]): PurchaseItemInput[] =>
  lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    barcode: l.barcode,
    stockType: l.stockType,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    promo: l.promo,
  }));
