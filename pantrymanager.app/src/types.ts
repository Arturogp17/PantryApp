import { AxiosError } from "axios";

export interface Product {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  quantity: number;
  price: number;
  stockType: 'Units' | 'Kilograms' | 'Liters';
  unitOfMeasure: string;
}

export interface PurchaseItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  currentStock: number;
}

export interface PurchaseResponse {
  id: number;
  purchaseDate: string;
  totalAmount: number;
  items: PurchaseItemResponse[];
}

export interface PurchaseItemResponse {
  productId: number;
  quantity: number;
  unitPrice: number;
}

export type StockType = 'Units' | 'Kilograms' | 'Liters';

// Nuevo tipo para errores de API
export type ApiError = AxiosError<{
  message?: string;
  errors?: Record<string, string[]>;
}>;