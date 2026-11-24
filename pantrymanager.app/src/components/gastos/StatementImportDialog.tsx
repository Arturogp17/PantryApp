import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import api from "../../api/client";
import { Card, Expense, ExpenseCategory, StatementImportRequest, StatementImportResult } from "../../types";
import { errorMessage } from "../../lib/errors";
import { dateLabel, dayLabel, shiftDays } from "../../lib/expenses";
import { formatMoney } from "../../lib/money";
import { parseStatement } from "../../lib/statements/parse";
import { extractPdfLines } from "../../lib/statements/pdfText";
import { buildImportDraft, matchExistingExpenses } from "../../lib/statements/import";
import type { ExpenseDraft, ImportDraft } from "../../lib/statements/import";
import { suggestCategoryId } from "../../lib/statements/categorize";
import { StatementParseError } from "../../lib/statements/types";
import type { ParsedStatement } from "../../lib/statements/types";

interface Props {
  open: boolean;
  cards: Card[];
  categories: ExpenseCategory[];
  onClose: () => void;
  onImported: () => void;
}

type Step = "file" | "review" | "done";

interface CategoryOption {
  id: number;
  label: string;
}

const READ_NOTE = "El archivo se lee en tu teléfono y no se sube a ningún lado. Solo se guarda lo que confirmes.";
const BANK_NAMES: Record<ParsedStatement["bank"], string> = { banamex: "Banamex", bbva: "BBVA" };
// Sin reglas de aprendizaje: la categoría de intereses sale siempre de las reglas por texto.
const INTEREST_MERCHANT = "Intereses y comisiones";

const bySortOrder = (a: ExpenseCategory, b: ExpenseCategory): number => a.sortOrder - b.sortOrder;

// Categorías principales y sus subcategorías, en el orden de la app.
function buildCategoryOptions(categories: ExpenseCategory[]): CategoryOption[] {
  const options: CategoryOption[] = [];
  for (const parent of categories.filter((c) => c.parentId === null).sort(bySortOrder)) {
    options.push({ id: parent.id, label: parent.name });
    for (const child of categories.filter((c) => c.parentId === parent.id).sort(bySortOrder)) {
      options.push({ id: child.id, label: `${parent.name} · ${child.name}` });
    }
  }
  return options;
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
    <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{label}</Typography>
    <Typography sx={{ fontSize: 14, fontWeight: 800, textAlign: "right" }}>{value}</Typography>
  </Box>
);

interface ExpenseRowProps {
  row: ExpenseDraft;
  on: boolean;
  captured: boolean;
  categoryId: number | null;
  options: CategoryOption[];
  onToggle: (on: boolean) => void;
  onCategory: (id: number | null) => void;
}

const ExpenseRow = ({ row, on, captured, categoryId, options, onToggle, onCategory }: ExpenseRowProps) => {
  const missing = on && categoryId === null;
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 1, borderBottom: 1, borderColor: "divider", opacity: on ? 1 : 0.6 }}>
      <Checkbox
        checked={on}
        onChange={(e) => onToggle(e.target.checked)}
        slotProps={{ input: { "aria-label": `Importar ${row.merchant}` } }}
        sx={{ mt: 0.5, p: 1 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, overflowWrap: "anywhere" }}>{row.merchant}</Typography>
          {captured && <Chip label="Ya capturado" size="small" variant="outlined" />}
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`${dayLabel(row.date)} · ${formatMoney(row.amount)}`}</Typography>
        <TextField
          select
          size="small"
          fullWidth
          label="Categoría"
          value={categoryId ?? ""}
          onChange={(e) => onCategory(e.target.value === "" ? null : Number(e.target.value))}
          error={missing}
          helperText={missing ? "Elige una categoría" : " "}
          sx={{ mt: 0.5 }}
        >
          {options.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Box>
  );
};

const StatementImportDialog = ({ open, cards, categories, onClose, onImported }: Props) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const inputRef = useRef<HTMLInputElement>(null);

  const creditCards = useMemo(() => cards.filter((c) => c.kind === "credit" && c.isActive), [cards]);
  const options = useMemo(() => buildCategoryOptions(categories), [categories]);

  const [step, setStep] = useState<Step>("file");
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);

  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState("");
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  // Los planes no tienen fila de revisión que esperar, así que sin valor cuentan como marcados.
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [result, setResult] = useState<StatementImportResult | null>(null);

  const resetAll = useCallback(() => {
    setStep("file");
    setReading(false);
    setFileError("");
    setParsed(null);
    setCardId(null);
    setDraft(null);
    setExpensesLoaded(false);
    setExpensesLoading(false);
    setExpensesError("");
    setCaptured(new Set());
    setPicked({});
    setChecked({});
    setSaving(false);
    setSaveError("");
    setResult(null);
  }, []);

  useEffect(() => {
    if (open) resetAll();
  }, [open, resetAll]);

  const selectedCard = creditCards.find((c) => c.id === cardId) ?? null;
  const noCardMatches = parsed !== null && !creditCards.some((c) => c.last4 === parsed.last4);
  const isOn = (key: string): boolean => checked[key] ?? true;

  const chooseFile = async (file: File) => {
    setReading(true);
    setFileError("");
    setParsed(null);
    setCardId(null);
    try {
      const lines = await extractPdfLines(file);
      const statement = parseStatement(lines);
      setParsed(statement);
      const match = creditCards.find((c) => c.last4 !== null && c.last4 === statement.last4);
      setCardId(match ? match.id : null);
    } catch (err) {
      setFileError(
        err instanceof StatementParseError
          ? err.message
          : "No se pudo leer el archivo. Revisa que sea un estado de cuenta de Banamex o BBVA."
      );
    } finally {
      setReading(false);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Se vacía para que volver a elegir el mismo archivo también dispare el cambio.
    e.target.value = "";
    if (file) void chooseFile(file);
  };

  // Gastos ya capturados de la tarjeta en el periodo (con margen de días) y gastos recientes para proponer categoría.
  const loadExpenses = async (statement: ParsedStatement, card: Card, built: ImportDraft) => {
    setExpensesLoading(true);
    setExpensesError("");
    try {
      const [recentRes, capturedRes] = await Promise.all([
        api.get<Expense[]>("/expenses", { params: { take: 100 } }),
        api.get<Expense[]>("/expenses", {
          params: {
            from: shiftDays(statement.periodStart, -3),
            to: shiftDays(statement.periodEnd, 4),
            cardId: card.id,
            take: 100,
          },
        }),
      ]);

      const matches = matchExistingExpenses(built.expenses, capturedRes.data, card);
      const nextPicked: Record<string, number | null> = {};
      const nextChecked: Record<string, boolean> = {};
      for (const d of built.expenses) {
        nextPicked[d.importKey] = d.isInterest
          ? suggestCategoryId(INTEREST_MERCHANT, categories, [])
          : suggestCategoryId(d.merchant, categories, recentRes.data);
        nextChecked[d.importKey] = !matches.has(d.importKey);
      }

      setPicked(nextPicked);
      setChecked((prev) => ({ ...prev, ...nextChecked }));
      setCaptured(new Set(matches.keys()));
      setExpensesLoaded(true);
    } catch (err) {
      setExpensesError(errorMessage(err, "No se pudieron cargar los gastos ya capturados"));
    } finally {
      setExpensesLoading(false);
    }
  };

  const startReview = () => {
    if (!parsed || !selectedCard) return;
    const built = buildImportDraft(parsed);
    setDraft(built);
    setPicked({});
    setChecked({});
    setCaptured(new Set());
    setExpensesLoaded(false);
    setExpensesError("");
    setStep("review");
    void loadExpenses(parsed, selectedCard, built);
  };

  const setExpenseOn = (key: string, on: boolean) => setChecked((prev) => ({ ...prev, [key]: on }));

  const setAllExpenses = (on: boolean) => {
    if (!draft) return;
    setChecked((prev) => {
      const next = { ...prev };
      for (const d of draft.expenses) next[d.importKey] = on && !captured.has(d.importKey);
      return next;
    });
  };

  const expenseRows = expensesLoaded && draft ? draft.expenses : [];
  const selectedExpenses = expenseRows.filter((d) => isOn(d.importKey));
  const selectedPlans = draft ? draft.installments.filter((p) => isOn(p.importKey)) : [];
  const missingCategory = selectedExpenses.some((d) => (picked[d.importKey] ?? null) === null);
  const canImport =
    !saving &&
    expensesLoaded &&
    selectedExpenses.length + selectedPlans.length > 0 &&
    !missingCategory;

  const importNow = async () => {
    if (!parsed || !draft || cardId === null || !canImport) return;

    const expenses: StatementImportRequest["expenses"] = [];
    for (const d of draft.expenses) {
      if (!isOn(d.importKey)) continue;
      const categoryId = picked[d.importKey] ?? null;
      if (categoryId === null) return;
      expenses.push({
        importKey: d.importKey,
        date: d.date,
        amount: d.amount,
        merchant: d.merchant,
        categoryId,
        note: d.note,
      });
    }

    const installments: StatementImportRequest["installments"] = selectedPlans.map((p) => ({
      importKey: p.importKey,
      name: p.name,
      totalAmount: p.totalAmount,
      months: p.months,
      firstPaymentDate: p.firstPaymentDate,
      categoryId: null,
      note: null,
    }));

    const body: StatementImportRequest = {
      cardId,
      statement: {
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        dueDate: parsed.dueDate,
        payToAvoidInterest: parsed.payToAvoidInterest,
        minimumPayment: parsed.minimumPayment,
        minimumPlusInstallments: parsed.minimumPlusInstallments,
        totalBalance: parsed.totalBalance,
        regularBalance: parsed.regularBalance,
        installmentBalance: parsed.installmentBalance,
        creditLimit: parsed.creditLimit,
        availableCredit: parsed.availableCredit,
        annualRate: parsed.annualRate,
      },
      installments,
      expenses,
    };

    setSaving(true);
    setSaveError("");
    try {
      const r = await api.post<StatementImportResult>("/statements/import", body);
      setResult(r.data);
      setStep("done");
    } catch (err) {
      setSaveError(errorMessage(err, "No se pudo importar el estado de cuenta"));
    } finally {
      setSaving(false);
    }
  };

  // Si ya se importó, avisa a la página para que recargue antes de cerrar.
  const finish = () => {
    if (saving) return;
    if (result) onImported();
    onClose();
  };

  const retryExpenses = () => {
    if (!parsed || !selectedCard || !draft) return;
    void loadExpenses(parsed, selectedCard, draft);
  };

  return (
    <Dialog open={open} onClose={finish} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>Importar estado de cuenta</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {step === "file" && (
            <>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{READ_NOTE}</Typography>

              <Box>
                <Button variant="contained" fullWidth disabled={reading} onClick={() => inputRef.current?.click()}>
                  Elegir PDF del estado de cuenta
                </Button>
                <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onFileChange} />
              </Box>

              {reading && <Typography sx={{ fontWeight: 700 }}>Leyendo el estado…</Typography>}
              {fileError && <Alert severity="error">{fileError}</Alert>}

              {parsed && !reading && (
                <>
                  <Typography sx={{ fontSize: 14 }}>{`Estado de ${BANK_NAMES[parsed.bank]} con corte ${dateLabel(parsed.periodEnd)}.`}</Typography>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>Tarjeta de crédito</Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {creditCards.map((c) => (
                        <Chip
                          key={c.id}
                          label={c.last4 ? `${c.name} ·${c.last4}` : c.name}
                          clickable
                          color={cardId === c.id ? "primary" : "default"}
                          variant={cardId === c.id ? "filled" : "outlined"}
                          onClick={() => setCardId(c.id)}
                          sx={{ height: 44 }}
                        />
                      ))}
                    </Box>
                    {noCardMatches && (
                      <Alert severity="warning" sx={{ mt: 1.5 }}>
                        {`Ninguna tarjeta termina en ${parsed.last4}. Elige una o agrégala en Tarjetas.`}
                      </Alert>
                    )}
                  </Box>
                  <Button variant="contained" fullWidth disabled={!selectedCard} onClick={startReview}>
                    Revisar estado
                  </Button>
                </>
              )}
            </>
          )}

          {step === "review" && parsed && (
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Fact label="Banco" value={BANK_NAMES[parsed.bank]} />
                <Fact label="Periodo" value={`${dateLabel(parsed.periodStart)} al ${dateLabel(parsed.periodEnd)}`} />
                <Fact label="Fecha límite" value={dateLabel(parsed.dueDate)} />
                <Fact label="Pago para no generar intereses" value={formatMoney(parsed.payToAvoidInterest)} />
                <Fact label="Pago mínimo" value={formatMoney(parsed.minimumPayment)} />
                <Fact label="Saldo total" value={parsed.totalBalance === null ? "No aparece" : formatMoney(parsed.totalBalance)} />
              </Box>

              {parsed.reconciles ? (
                <Alert severity="success">Los movimientos suman lo mismo que el estado</Alert>
              ) : (
                <Alert severity="warning">
                  {parsed.printedCharges === null
                    ? `No cuadra: leí ${formatMoney(parsed.readCharges)} de cargos y el estado no trae el total. Revisa antes de importar.`
                    : `No cuadra: leí ${formatMoney(parsed.readCharges)} de cargos y el estado dice ${formatMoney(parsed.printedCharges)}. Revisa antes de importar.`}
                </Alert>
              )}

              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 0.5 }}>Planes a meses</Typography>
                {draft && draft.installments.length === 0 && (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No hay planes para importar.</Typography>
                )}
                {draft?.installments.map((p) => {
                  const on = isOn(p.importKey);
                  return (
                    <Box
                      key={p.importKey}
                      sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 1, borderBottom: 1, borderColor: "divider", opacity: on ? 1 : 0.6 }}
                    >
                      <Checkbox
                        checked={on}
                        onChange={(e) => setExpenseOn(p.importKey, e.target.checked)}
                        slotProps={{ input: { "aria-label": `Importar plan ${p.name}` } }}
                        sx={{ mt: 0.5, p: 1 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 15, overflowWrap: "anywhere" }}>{p.name}</Typography>
                        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                          {`${p.paidCount} de ${p.months} mensualidades pagadas`}
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                          {`mensualidad ${formatMoney(p.monthlyAmount)} · faltan ${formatMoney(p.pendingBalance)}`}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                {draft?.skippedInstallments.map((s, i) => (
                  <Typography key={`${s.name}-${i}`} sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
                    {`No se importa ${s.name}: ${s.reason}.`}
                  </Typography>
                ))}
              </Box>

              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 0.5 }}>Gastos</Typography>
                {expensesLoading && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Buscando gastos ya capturados…</Typography>}
                {expensesError && (
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" size="small" onClick={retryExpenses}>
                        Reintentar
                      </Button>
                    }
                  >
                    {expensesError}
                  </Alert>
                )}
                {expensesLoaded && draft && (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                        {`${selectedExpenses.length} seleccionados de ${draft.expenses.length}`}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Button size="small" onClick={() => setAllExpenses(true)}>
                          Marcar todos
                        </Button>
                        <Button size="small" onClick={() => setAllExpenses(false)}>
                          Quitar todos
                        </Button>
                      </Box>
                    </Box>
                    {draft.expenses.map((d) => (
                      <ExpenseRow
                        key={d.importKey}
                        row={d}
                        on={isOn(d.importKey)}
                        captured={captured.has(d.importKey)}
                        categoryId={picked[d.importKey] ?? null}
                        options={options}
                        onToggle={(on) => setExpenseOn(d.importKey, on)}
                        onCategory={(id) => setPicked((prev) => ({ ...prev, [d.importKey]: id }))}
                      />
                    ))}
                  </>
                )}
              </Box>

              {saveError && <Alert severity="error">{saveError}</Alert>}
            </>
          )}

          {step === "done" && result && (
            <Alert severity="success">
              {`Se importaron ${result.expensesCreated} gastos (${result.expensesSkipped} ya estaban) y ${result.plansCreated} planes (${result.plansSkipped} ya estaban).`}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: "space-between" }}>
        {step === "file" && (
          <Button onClick={finish} disabled={reading}>
            Cancelar
          </Button>
        )}
        {step === "review" && (
          <>
            <Button onClick={resetAll} disabled={saving || expensesLoading}>
              Elegir otro archivo
            </Button>
            <Button variant="contained" onClick={importNow} disabled={!canImport}>
              {saving
                ? "Importando…"
                : `Importar ${selectedExpenses.length} gastos y ${selectedPlans.length} planes`}
            </Button>
          </>
        )}
        {step === "done" && (
          <Button variant="contained" onClick={finish} sx={{ ml: "auto" }}>
            Cerrar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default StatementImportDialog;
