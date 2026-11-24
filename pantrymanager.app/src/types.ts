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

// ---- Gastos ----

export interface Card {
  id: number;
  name: string;
  bank: string;
  // Vales: tarjetas de vales de despensa, sin corte, vencimiento ni tasa.
  kind: "credit" | "debit" | "voucher";
  last4: string | null;
  color: string;
  cutoffDay: number | null;
  dueDay: number | null;
  annualRate: number | null;
  isActive: boolean;
}

// Fuente de ingreso (quincena, sueldo mensual o un pago único).
// cardId null es dinero disponible; con un id, el ingreso se deposita en esa tarjeta de vales.
export interface IncomeSource {
  id: number;
  name: string;
  amount: number;
  kind: "semimonthly" | "monthly" | "once";
  day1: number | null;
  day2: number | null;
  date: string | null;
  cardId: number | null;
  isActive: boolean;
}

export type IncomeInput = Omit<IncomeSource, "id">;

// Dinero disponible que el usuario captura a mano, con la fecha a la que corresponde.
export interface FundsState {
  amount: number;
  asOf: string | null;
  updatedAt: string | null;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  parentId: number | null;
  color: string | null;
  sortOrder: number;
}

export interface Expense {
  id: number;
  date: string; // "2026-11-21"
  amount: number;
  merchant: string;
  note: string | null;
  categoryId: number;
  categoryName: string;
  parentCategoryName: string | null;
  cardId: number | null;
  methodName: string;
  cardLast4: string | null;
  methodColor: string;
  createdBy: string;
}

export interface ExpenseInput {
  clientRequestId?: string;
  date: string;
  amount: number;
  merchant: string;
  note: string | null;
  categoryId: number;
  cardId: number | null;
}

export interface MonthSpend {
  month: string; // "2026-11"
  total: number;
  byCategory: { id: number; total: number }[];
}

export interface CategorySpend {
  categoryId: number;
  name: string;
  color: string;
  total: number;
  children: { categoryId: number; name: string; total: number }[];
}

export interface MethodSpend {
  cardId: number | null;
  name: string;
  color: string;
  total: number;
}

export interface ExpenseSummary {
  month: string;
  total: number;
  count: number;
  previousMonthTotal: number;
  byMonth: MonthSpend[];
  byCategory: CategorySpend[];
  byMethod: MethodSpend[];
}

// ---- Meses sin intereses y recurrentes ----

// Renglón de GET /installments
export interface InstallmentPlan {
  id: number;
  name: string;
  cardId: number;
  cardName: string;
  cardColor: string;
  totalAmount: number;
  months: number;
  monthlyAmount: number;
  firstPaymentDate: string; // "2026-11-21"
  categoryId: number | null;
  note: string | null;
  paidCount: number;
  remainingAmount: number;
  lastPaymentDate: string;
  isFinished: boolean;
  // Mensualidad fija con intereses. Null: la mensualidad es totalAmount / months.
  monthlyPayment: number | null;
  // Tasa anual en porcentaje (45 = 45 %). Null si el plan no tiene intereses.
  interestRate: number | null;
}

// Cuerpo de POST /installments y PUT /installments/{id}
export interface InstallmentInput {
  name: string;
  cardId: number;
  totalAmount: number;
  months: number;
  firstPaymentDate: string;
  categoryId: number | null;
  note: string | null;
  monthlyPayment: number | null;
  interestRate: number | null;
}

// Renglón de GET /recurring
export interface RecurringCharge {
  id: number;
  name: string;
  amount: number;
  frequency: "monthly" | "yearly";
  dayOfMonth: number;
  monthOfYear: number | null; // solo anuales
  cardId: number | null;
  cardName: string | null;
  cardColor: string | null;
  categoryId: number | null;
  categoryName: string | null;
  isActive: boolean;
  nextDate: string;
}

// Cuerpo de POST /recurring y PUT /recurring/{id}
export interface RecurringInput {
  name: string;
  amount: number;
  frequency: "monthly" | "yearly";
  dayOfMonth: number;
  monthOfYear: number | null;
  cardId: number | null;
  categoryId: number | null;
  isActive: boolean;
}

export interface CommitmentCardTotal {
  cardId: number;
  cardName: string;
  color: string;
  total: number;
}

export interface CommitmentMonth {
  month: string; // "2026-12"
  installmentsTotal: number;
  recurringTotal: number;
  total: number;
  byCard: CommitmentCardTotal[];
}

// GET /commitments
export interface CommitmentsResponse {
  months: CommitmentMonth[];
}

// ---- Estados de cuenta ----

// Renglón de GET /statements/latest. Uno por tarjeta, el estado más reciente.
export interface StatementSummary {
  cardId: number;
  periodStart: string; // "2026-10-17"
  periodEnd: string;
  dueDate: string;
  payToAvoidInterest: number;
  minimumPayment: number;
  minimumPlusInstallments: number | null;
  totalBalance: number | null;
  regularBalance: number | null;
  installmentBalance: number | null;
  creditLimit: number | null;
  availableCredit: number | null;
  annualRate: number | null;
  importedAt: string;
}

// Cuerpo de POST /statements/import. Solo sale lo que el usuario confirma; el PDF no se sube.
export interface StatementImportRequest {
  cardId: number;
  // null en tarjetas de débito: solo se importan gastos.
  statement: {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    payToAvoidInterest: number;
    minimumPayment: number;
    minimumPlusInstallments: number | null;
    totalBalance: number | null;
    regularBalance: number | null;
    installmentBalance: number | null;
    creditLimit: number | null;
    availableCredit: number | null;
    annualRate: number | null;
  } | null;
  installments: {
    importKey: string;
    name: string;
    totalAmount: number;
    months: number;
    firstPaymentDate: string;
    categoryId: number | null;
    note: string | null;
    monthlyPayment: number | null;
    interestRate: number | null;
  }[];
  expenses: {
    importKey: string;
    date: string;
    amount: number;
    merchant: string;
    categoryId: number;
    note: string | null;
  }[];
}

// Respuesta de POST /statements/import. Las claves repetidas se cuentan como "ya estaban".
export interface StatementImportResult {
  statementId: number;
  expensesCreated: number;
  expensesSkipped: number;
  plansCreated: number;
  plansSkipped: number;
}

// ---- Pagos a tarjeta y presupuestos ----

export interface CardPayment {
  id: number;
  cardId: number;
  date: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface CardPaymentInput {
  cardId: number;
  date: string;
  amount: number;
  note: string | null;
  clientRequestId: string;
  deductFromFunds: boolean;
}

// Lo pagado a una tarjeta desde su último corte, hasta periodEnd.
export interface PaidSinceCutoff {
  cardId: number;
  paid: number;
  periodEnd: string;
}

export interface CategoryBudget {
  categoryId: number;
  monthlyAmount: number;
}
