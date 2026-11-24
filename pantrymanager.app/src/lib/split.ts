import { formatMoney, roundMoney } from "./money";

// Un pago de una compra o de un gasto: método (null es efectivo) y monto.
// amount null es la parte "lo que falte": recibe lo que no cubren las demás.
export interface SplitPart {
  cardId: number | null;
  amount: number | null;
}

export interface SplitResult {
  parts: { cardId: number | null; amount: number }[];
  remaining: number;
  error: string | null;
}

// Reparte el total entre los pagos y dice si cuadra. Los montos se redondean a centavos.
// Con error, parts trae los montos calculados igual, pero no deben usarse.
export function resolveSplit(total: number, parts: SplitPart[]): SplitResult {
  const target = roundMoney(total);
  const freeCount = parts.filter((p) => p.amount === null).length;
  const explicitSum = roundMoney(
    parts.reduce((sum, p) => (p.amount === null ? sum : sum + roundMoney(p.amount)), 0)
  );
  const freeAmount = roundMoney(target - explicitSum);

  const resolved = parts.map((p) => ({
    cardId: p.cardId,
    amount: p.amount === null ? freeAmount : roundMoney(p.amount),
  }));
  const assigned = roundMoney(resolved.reduce((sum, p) => sum + p.amount, 0));
  const remaining = roundMoney(target - assigned);

  const ids = parts.map((p) => p.cardId);
  let error: string | null = null;
  if (ids.some((id, i) => ids.indexOf(id) !== i)) {
    error = "Elegiste el mismo método dos veces";
  } else if (freeCount > 1) {
    error = "Solo una parte puede quedar sin monto";
  } else if (parts.some((p) => p.amount !== null && !(roundMoney(p.amount) > 0))) {
    error = "Cada pago debe ser mayor a $0";
  } else if (explicitSum > target) {
    error = "Los pagos suman más que el total";
  } else if (freeCount === 0 && remaining > 0) {
    error = `Faltan ${formatMoney(remaining)} por asignar`;
  } else if (resolved.some((p) => !(p.amount > 0))) {
    error = "Cada pago debe ser mayor a $0";
  }

  return { parts: resolved, remaining, error };
}
