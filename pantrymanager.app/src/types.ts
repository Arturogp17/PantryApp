import { AxiosError } from "axios";
import type { Promo } from "./lib/promo";

export interface Product {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  stockType: number;
  unitOfMeasure: string;
  formattedImageUrl: string;
}

// Renglón de la lista de compras compartida.
export interface ShoppingListItem {
  id: number;
  productId: number;
  name: string;
  barcode: string | null;
  imageUrl: string;
  quantity: number;
  stockType: number;
  unitOfMeasure: string;
  lastPrice: number;
  stock: number;
  addedBy: string;
}

export interface Suggestion {
  productId: number;
  name: string;
  reason: string;
}

// Respuesta de GET /barcode/{code}
export interface BarcodeLookup {
  source: "catalog" | "openfoodfacts";
  productId: number | null;
  name: string;
  stockType?: number;
  price?: number;
  imageUrl?: string | null;
}

// Renglón que se envía a POST /purchases. El producto se identifica por id, código o nombre.
export interface PurchaseItemInput {
  productId: number | null;
  name: string;
  barcode: string | null;
  stockType: number;
  quantity: number;
  unitPrice: number;
  promo?: Promo;
}

export interface PurchaseResponse {
  id: number;
  purchaseDate: string;
  totalAmount: number;
  items: PurchaseItemResponse[];
}

export interface PurchaseItemResponse {
  productId: number;
  productName: string;
  stockType: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  promo: Promo | null;
}

// GET /purchases/summary
export interface ProductSpend {
  productId: number;
  name: string;
  stockType: number;
  spent: number;
  quantity: number;
  times: number;
}

export interface PurchaseSummary {
  totalSpent: number;
  purchaseCount: number;
  savings: number;
  byProduct: ProductSpend[];
}

export type ApiError = AxiosError<{
  message?: string;
  errors?: Record<string, string[]>;
}>;
