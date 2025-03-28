// src/utils/stockTypeHelpers.ts
export const getStockTypeLabel = (stockType: number) => {
    switch (stockType) {
      case 0:
        return 'unidades';
      case 1:
        return 'kilogramos';
      case 2:
        return 'litros';
      default:
        return 'unidades';
    }
  };