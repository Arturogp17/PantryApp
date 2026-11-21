// toFixed(6) quita el ruido de punto flotante (29.985 * 100 = 2998.4999999999995) antes de redondear,
// para que el redondeo coincida con el del servidor (decimal, mitad hacia arriba).
export const roundMoney = (value: number): number =>
  Math.round(Number((value * 100).toFixed(6))) / 100;

export const roundQuantity = (value: number): number =>
  Math.round(Number((value * 1000).toFixed(6))) / 1000;

const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export const formatMoney = (value: number): string => formatter.format(value);

export const formatQuantity = (value: number): string =>
  String(roundQuantity(value));
