// StockType del backend: 0 unidades, 1 kilogramos, 2 litros.
export const STOCK_TYPES = [
  { value: 0, label: "Unidades", unit: "unidades", step: 1 },
  { value: 1, label: "Kilogramos", unit: "kg", step: 0.5 },
  { value: 2, label: "Litros", unit: "L", step: 0.5 },
];

const find = (stockType: number) =>
  STOCK_TYPES.find((t) => t.value === stockType) ?? STOCK_TYPES[0];

export const unitLabel = (stockType: number): string => find(stockType).unit;

// Cuánto suman o restan los botones + y - del inventario.
export const unitStep = (stockType: number): number => find(stockType).step;
