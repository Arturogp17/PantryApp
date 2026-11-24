import type { ExpenseCategory } from "../../types";
import { lastForMerchant } from "../expenses";

// Reglas por texto del comercio. Cada una apunta a una categoría por nombre, o a una subcategoría
// con [categoría, subcategoría]. Si el nombre no existe en la app (se renombró o borró), la regla se ignora.
const RULES: [RegExp, [string] | [string, string]][] = [
  [/INTERES|COMISION|IVA POR INTERESES/i, ["Comisiones e intereses"]],
  [/COSTCO GAS|GASOLINER|PEMEX|ONEXPRESS|OXXO GAS/i, ["Gasolina"]],
  [/GASERA/i, ["Servicios", "Gas"]],
  [/COSTCO/i, ["Costco"]],
  [/^WAL ?MART|\bHEB\b|SORIANA|CHEDRAUI|ABTS|ABARR|MISCELANEA|CARNICERIA|CREMERIA|FRUTERIA|LA COMER/i, ["Súper"]],
  [/FARMACIA|\bFARM\b|SIMILARE|BENAVIDES/i, ["Salud"]],
  [/SPOTIFY|NETFLIX|YOUTUBE|GOOGLE ?ONE|DISNEY|HBO|PRIME VIDEO|APPLE\.COM/i, ["Servicios", "Suscripciones"]],
  [/TELCEL|AT&T|\bWOM\b/i, ["Servicios", "Celular"]],
  [/TELMEX|IZZI|TOTAL ?PLAY/i, ["Servicios", "Internet"]],
  [/SHEIN|LIVERPOOL|ZARA|H&M|PULL ?& ?BEAR|COPPEL/i, ["Ropa"]],
  [/BONETERIA|MERCERIA/i, ["Hogar"]],
  [/\bCFE\b/i, ["Servicios", "Luz"]],
  [/INTERAPAS|SIMAS/i, ["Servicios", "Agua"]],
  [/FERRETER|HOME DEPOT/i, ["Hogar"]],
  [/DOMINOS|TAMALES|TAQUER|\bREST\b|RESTAURANT|CAFE|PIZZA|BURGER|STARBUCKS|COCINA/i, ["Comida fuera"]],
];

const norm = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function findCategory(path: [string] | [string, string], categories: ExpenseCategory[]): number | null {
  const parent = categories.find((c) => c.parentId === null && norm(c.name) === norm(path[0]));
  if (!parent) return null;
  if (path.length === 1) return parent.id;

  const child = categories.find((c) => c.parentId === parent.id && norm(c.name) === norm(path[1]));
  // Sin la subcategoría, queda la categoría principal.
  return child ? child.id : parent.id;
}

// Categoría propuesta para un comercio: primero lo que ya se capturó con ese comercio, luego las reglas.
export function suggestCategoryId(
  merchant: string,
  categories: ExpenseCategory[],
  recent: { merchant: string; categoryId: number }[]
): number | null {
  const known = lastForMerchant(recent, merchant);
  if (known && categories.some((c) => c.id === known.categoryId)) return known.categoryId;

  for (const [pattern, path] of RULES) {
    if (pattern.test(merchant)) {
      const id = findCategory(path, categories);
      if (id !== null) return id;
    }
  }
  return null;
}
