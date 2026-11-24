import { describe, expect, test } from "vitest";
import {
  annualRateAfterLabel,
  cleanMerchant,
  firstPaymentFromStatement,
  parseBanamexStatement,
  parseSpanishDate,
} from "./statements/banamex";
import { buildImportDraft, matchExistingExpenses } from "./statements/import";
import { parseBbvaStatement } from "./statements/bbva";
import { parseStatement } from "./statements/parse";
import { suggestCategoryId } from "./statements/categorize";
import { piecesToLines } from "./statements/pdfText";
import { StatementParseError } from "./statements/types";

// Estado de ejemplo con datos inventados, con la misma estructura que uno de Banamex.
const SAMPLE = `
Estado de Cuenta Mensual
Tarjeta de Crédito EXPLORA BANAMEX
Tarjeta de Crédito EXPLORA BANAMEX Periodo: 17-oct-2026 al 18-nov-2026
Número de tarjeta 1234 5678 9012 3456 Fecha de corte: 18-nov-2026
Fecha límite de pago: 1 martes, 8-dic-2026
Pago para no generar intereses: 2 $2,000.00
Pago mínimo + compras y cargos diferidos a meses: 3 $900.00
Pago mínimo: 4 $600.00
Saldo cargos regulares: $ 2,000.00
Saldo cargos a meses: $ 600.00
Saldo deudor total: 11 $ 2,600.00
Límite de crédito: $ 20,000.00
Crédito disponible: $ 17,400.00
Crédito disponible para disposiciones $ 17,400.00
DESGLOSE DE MOVIMIENTOS14
COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES
Tarjeta titular: 12345678 90123456 NOMBRE DE PRUEBA
07-nov-2026 TIENDA UNO TUN 0803124V6MX $900.00 $600.00 $300.00 1 de 3 NA
COMPRAS Y CARGOS DIFERIDOS A MESES CON INTERESES
Tarjeta titular: 12345678 90123456 NOMBRE DE PRUEBA
18-nov-2026 PRESTAMO $5,000.00 $0.00 $10.00 $1.60 $400.00 12 de 12 45.00%
CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)
Tarjeta titular: 12345678 90123456 NOMBRE DE PRUEBA
29-oct-2026 30-oct-2026 CAFE DEL CENTRO CCE 140618P37MX + $100.00
03-nov-2026 04-nov-2026 HEB SAN LUIS POTOSI SIH 9511279T7MX + $250.50
03-nov-2026 04-nov-2026 COSTCO GAS SLP CGA160215952MX + $1,000.00
07-nov-2026 09-nov-2026 TIENDA UNO 001 de 003 + $300.00
08-nov-2026 09-nov-2026 SU ABONO...GRACIAS - $500.00
18-nov-2026 18-nov-2026 INTERES GRAVABLE + $50.00
18-nov-2026 18-nov-2026 IVA POR INTERESES Y/O COMISIONES + $8.00
Tarjeta digital: 12345678 90000000 NOMBRE DE PRUEBA
25-oct-2026 26-oct-2026 SPOTIFY RSM 160408CSAMX + $100.00
Total cargos + $1,808.50
Total abonos - $500.00
`.split("\n");

const categories = [
  { id: 1, name: "Súper", parentId: null, color: "#111111", sortOrder: 0 },
  { id: 2, name: "Gasolina", parentId: null, color: "#222222", sortOrder: 1 },
  { id: 3, name: "Servicios", parentId: null, color: "#333333", sortOrder: 2 },
  { id: 4, name: "Suscripciones", parentId: 3, color: null, sortOrder: 0 },
  { id: 5, name: "Comida fuera", parentId: null, color: "#444444", sortOrder: 3 },
];

describe("estado de Banamex", () => {
  const statement = parseBanamexStatement(SAMPLE);

  test("lee el resumen", () => {
    expect(statement.last4).toBe("3456");
    expect(statement.periodStart).toBe("2026-10-17");
    expect(statement.periodEnd).toBe("2026-11-18");
    expect(statement.dueDate).toBe("2026-12-08");
    expect(statement.payToAvoidInterest).toBe(2000);
    expect(statement.minimumPayment).toBe(600);
    expect(statement.minimumPlusInstallments).toBe(900);
    expect(statement.totalBalance).toBe(2600);
    expect(statement.creditLimit).toBe(20000);
    expect(statement.availableCredit).toBe(17400);
  });

  test("clasifica los movimientos", () => {
    const kinds = statement.lines.map((l) => l.kind);
    expect(kinds.filter((k) => k === "charge")).toHaveLength(4);
    expect(kinds.filter((k) => k === "interest")).toHaveLength(2);
    expect(kinds.filter((k) => k === "installment-payment")).toHaveLength(1);
    expect(kinds.filter((k) => k === "payment")).toHaveLength(1);
    expect(statement.lines.at(-1)?.holder).toBe("digital");
  });

  test("lo leído suma lo que dice el estado", () => {
    expect(statement.readCharges).toBe(1808.5);
    expect(statement.readPayments).toBe(500);
    expect(statement.reconciles).toBe(true);
  });

  test("lee los planes a meses, con y sin intereses", () => {
    expect(statement.installments).toHaveLength(2);
    expect(statement.installments[0]).toMatchObject({
      merchant: "TIENDA UNO",
      originalAmount: 900,
      pendingBalance: 600,
      paymentNumber: 1,
      totalPayments: 3,
      withInterest: false,
    });
    expect(statement.installments[1].withInterest).toBe(true);
  });

  test("no guarda el número completo de la tarjeta", () => {
    expect(JSON.stringify(statement)).not.toContain("1234 5678");
    expect(JSON.stringify(statement)).not.toContain("1234567890123456");
  });

  test("un PDF que no es de Banamex se rechaza", () => {
    expect(() => parseBanamexStatement(["Hola", "esto no es un estado"])).toThrow(StatementParseError);
  });

  test("si falta un renglón, no cuadra", () => {
    const missing = SAMPLE.filter((l) => !l.includes("HEB SAN LUIS"));
    expect(parseBanamexStatement(missing).reconciles).toBe(false);
  });
});

describe("estado de Banamex: fechas y comercios", () => {
  test("fecha en español", () => {
    expect(parseSpanishDate("08-dic-2026")).toBe("2026-12-08");
    expect(parseSpanishDate("8-ene-2027")).toBe("2027-01-08");
    expect(parseSpanishDate("08-xyz-2026")).toBeNull();
  });

  test("limpia la clave de RFC y la ciudad", () => {
    expect(cleanMerchant("HEB SAN LUIS POTOSI    SIH 9511279T7MX")).toBe("HEB SAN LUIS POTOSI");
    expect(cleanMerchant("MISCELANEA EL TRIUNFO HEGD631208L71MX")).toBe("MISCELANEA EL TRIUNFO");
    expect(cleanMerchant("ABTS EL GUERO        SN LUIS POTOSMX")).toBe("ABTS EL GUERO");
    expect(cleanMerchant("NETPAY *OPTICA         001 de 003")).toBe("NETPAY *OPTICA");
  });

  test("primer pago de un plan según el avance al corte", () => {
    expect(firstPaymentFromStatement("2026-11-18", 1)).toBe("2026-11-18");
    expect(firstPaymentFromStatement("2026-11-18", 3)).toBe("2026-09-18");
    expect(firstPaymentFromStatement("2026-03-31", 2)).toBe("2026-02-28");
  });
});

describe("importar un estado", () => {
  const statement = parseBanamexStatement(SAMPLE);
  const draft = buildImportDraft(statement);

  test("propone los cargos y un solo gasto de intereses", () => {
    expect(draft.expenses).toHaveLength(5);
    const interest = draft.expenses.find((e) => e.isInterest);
    expect(interest?.amount).toBe(58);
    expect(interest?.date).toBe("2026-11-18");
  });

  test("las mensualidades y el abono no son gastos", () => {
    expect(draft.expenses.some((e) => e.merchant.includes("TIENDA UNO"))).toBe(false);
    expect(draft.skippedLineCount).toBe(2);
  });

  test("importa el plan sin intereses y salta el plan con intereses", () => {
    expect(draft.installments).toHaveLength(1);
    expect(draft.installments[0]).toMatchObject({
      name: "TIENDA UNO",
      totalAmount: 900,
      months: 3,
      paidCount: 1,
      firstPaymentDate: "2026-11-18",
    });
    expect(draft.skippedInstallments).toHaveLength(1);
  });

  test("las claves de importación no se repiten", () => {
    const keys = draft.expenses.map((e) => e.importKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("marca como ya capturado un gasto con mismo monto, fecha cercana y tarjeta", () => {
    const existing = [
      { id: 10, amount: 250.5, date: "2026-11-02", cardId: 7 },
      { id: 11, amount: 100, date: "2026-10-29", cardId: 8 },
    ] as never[];
    const matches = matchExistingExpenses(draft.expenses, existing, { id: 7 } as never);
    expect(matches.size).toBe(1);
    expect([...matches.values()][0].id).toBe(10);
  });
});

describe("categoría sugerida", () => {
  test("por reglas de texto", () => {
    expect(suggestCategoryId("HEB SAN LUIS POTOSI", categories, [])).toBe(1);
    expect(suggestCategoryId("COSTCO GAS SLP", categories, [])).toBe(2);
    expect(suggestCategoryId("SPOTIFY", categories, [])).toBe(4);
    expect(suggestCategoryId("COMERCIO DESCONOCIDO", categories, [])).toBeNull();
  });

  test("lo capturado antes con el mismo comercio gana sobre las reglas", () => {
    const recent = [{ merchant: "HEB SAN LUIS POTOSI", categoryId: 5 }];
    expect(suggestCategoryId("HEB SAN LUIS POTOSI", categories, recent)).toBe(5);
  });

  test("si la categoría de la regla ya no existe, no propone", () => {
    expect(suggestCategoryId("HEB SAN LUIS POTOSI", [categories[1]], [])).toBeNull();
  });
});

describe("líneas de un PDF", () => {
  test("junta por altura y ordena de izquierda a derecha", () => {
    const lines = piecesToLines([
      { str: "17-oct-2026", x: 400, y: 701 },
      { str: "Periodo:", x: 300, y: 700 },
      { str: "Título", x: 10, y: 720 },
      { str: "  ", x: 50, y: 650 },
    ]);
    expect(lines).toEqual(["Título", "Periodo: 17-oct-2026"]);
  });
});

// Estado de ejemplo con datos inventados, con la estructura de uno de BBVA.
const BBVA_SAMPLE = `
BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE
TU PAGO REQUERIDO ESTE PERIODO
Periodo: 02-oct-2026 al 01-nov-2026
Fecha límite de pago:1 lunes, 23-nov-2026
TARJETA AZUL BBVA (CLASICA) Pago para no generar intereses:2 $1,000.00
Número de tarjeta: 4000111122223333
Pago mínimo + compras y cargo diferidos a meses:3 $700.00
Pago mínimo:4 $200.00
Saldo cargos regulares: $1,000.00
Saldo cargo a meses: $1,200.00
Saldo deudor total:11 $2,200.00
Límite de crédito: $50,000.00
Crédito disponible: $47,800.00
DESGLOSE DE MOVIMIENTOS
COMPRAS Y CARGOS DIFERIDOS A MESES SIN INTERESES Tarjeta titular: XXXXXXXXXXXX3333
31-ago-2026 TIENDA A MESES ; Tarjeta Digital ***1020 $1,500.00 $500.00 $500.00 2 de 3 0.00%
CARGOS,COMPRAS Y ABONOS REGULARES(NO A MESES) Tarjeta titular: XXXXXXXXXXXX3333
06-oct-2026 07-oct-2026 TOTAL PLAY CR + $500.00
09-oct-2026 12-oct-2026 MERPAGO*TIENDA ; Tarjeta Digital ***1020 + $500.00
17-oct-2026 19-oct-2026 BMOVIL.PAGO TDC - $300.00
IVA :$ 0.00 Interes: $ 0.00 Comisiones:$0.00 Capital:$300.00
27-oct-2026 28-oct-2026 TIENDA B A MESES A 06 MESES S/I ; Tarjeta Digital ***1020 + $600.00
01-nov-2026 03-nov-2026 02 DE 03 TIENDA A MESES ; Tarjeta Digital ***1020 + $500.00
Total cargos $2,100.00
Total abonos -$300.00
`.split("\n");

describe("estado de BBVA", () => {
  const s = parseBbvaStatement(BBVA_SAMPLE);

  test("lee el resumen", () => {
    expect(s.bank).toBe("bbva");
    expect(s.last4).toBe("3333");
    expect(s.periodEnd).toBe("2026-11-01");
    expect(s.dueDate).toBe("2026-11-23");
    expect(s.payToAvoidInterest).toBe(1000);
    expect(s.minimumPayment).toBe(200);
    expect(s.installmentBalance).toBe(1200);
    expect(s.creditLimit).toBe(50000);
  });

  test("la compra original y las mensualidades no son gastos", () => {
    const draft = buildImportDraft(s);
    expect(draft.expenses.map((e) => e.merchant)).toEqual(["TOTAL PLAY CR", "TIENDA"]);
    expect(s.lines.filter((l) => l.kind === "installment-payment")).toHaveLength(2);
  });

  test("cuadra con los totales y trae el plan", () => {
    expect(s.reconciles).toBe(true);
    expect(s.installments).toHaveLength(1);
    expect(buildImportDraft(s).installments[0].months).toBe(3);
  });

  test("parseStatement elige el lector por banco", () => {
    expect(parseStatement(BBVA_SAMPLE).bank).toBe("bbva");
    expect(parseStatement(SAMPLE).bank).toBe("banamex");
    expect(() => parseStatement(["hola"])).toThrow(StatementParseError);
  });

  test("lee la tasa anual de la línea con Sin IVA", () => {
    const withRate = parseBbvaStatement([
      ...BBVA_SAMPLE,
      "CAT:10 TASA DE INTERES ANUAL VARIABLE",
      "1.3% Sin IVA 50.82%",
    ]);
    expect(withRate.annualRate).toBe(50.82);
    expect(s.annualRate).toBeNull();
  });
});

describe("tasa anual de interés", () => {
  test("toma el último porcentaje de la línea que sigue a la etiqueta", () => {
    expect(
      annualRateAfterLabel([
        "CAT:10 TASA DE INTERES ANUAL",
        "ORDINARIA VARIABLE",
        "PAGO PARA NO GENERAR",
        "INTERESES 2 71.5% Sin IVA 55.52%",
      ])
    ).toBe(55.52);
  });

  test("sin etiqueta o sin línea con Sin IVA es nulo", () => {
    expect(annualRateAfterLabel(["Pago mínimo: $600.00", "37.10%"])).toBeNull();
    expect(annualRateAfterLabel(["TASA DE INTERES ANUAL", "12.00%"])).toBeNull();
  });

  test("Banamex lee la tasa del estado de ejemplo", () => {
    const withRate = parseBanamexStatement([
      ...SAMPLE,
      "TASA DE INTERES ANUAL",
      "ORDINARIA VARIABLE",
      "INTERESES 2 71.5% Sin IVA 55.52%",
    ]);
    expect(withRate.annualRate).toBe(55.52);
    expect(parseBanamexStatement(SAMPLE).annualRate).toBeNull();
  });
});
