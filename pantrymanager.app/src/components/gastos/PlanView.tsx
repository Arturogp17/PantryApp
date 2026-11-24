import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import api from "../../api/client";
import { Card, FundsState, IncomeSource, PaidSinceCutoff, RecurringCharge, StatementSummary } from "../../types";
import { errorMessage } from "../../lib/errors";
import { dateLabel, dayMonthLabel, shiftDays, todayKey } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { buildCashflow, buildPaymentPlan, expandIncomes, expandRecurring, nextInflow } from "../../lib/finance";
import type { CashEvent, Cashflow, PlanCardInput, PlanLevel, PlanLine } from "../../lib/finance";
import { loadOutbox, queuedCardPaid } from "../../lib/outbox";
import IncomeDialog from "./IncomeDialog";
import PaymentDialog from "./PaymentDialog";

interface Props {
  cards: Card[];
  statements: StatementSummary[];
  onChanged: () => void;
  // Avisos de guardado sin conexión; los muestra la página de Gastos.
  onNotice?: (notice: string) => void;
}

const HORIZON_DAYS = 45;

const LEVEL_LABEL: Record<PlanLevel, string> = {
  full: "Evita intereses",
  partial: "Más del mínimo",
  minimum: "Solo el mínimo",
  short: "No alcanza",
};

const LEVEL_COLOR: Record<PlanLevel, "success" | "info" | "warning" | "error"> = {
  full: "success",
  partial: "info",
  minimum: "warning",
  short: "error",
};

const PLAN_NOTE =
  "Estimación con la tasa anual del estado. Cada banco calcula sus intereses a su manera; si no pagas el total, muchos cobran sobre todo el saldo.";

const cardTitle = (card: Card): string => (card.last4 ? `${card.name} ·${card.last4}` : card.name);

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ p: 2, mb: 1.5, bgcolor: "background.paper", borderRadius: "20px" }}>
    <Typography component="h2" sx={{ mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const LineRow = ({ line, onPay }: { line: PlanLine; onPay: () => void }) => (
  <Box sx={{ py: 1.25, borderBottom: 1, borderColor: "divider" }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
      <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere", minWidth: 0 }}>{line.name}</Typography>
      <Chip size="small" label={LEVEL_LABEL[line.level]} color={LEVEL_COLOR[line.level]} />
    </Box>
    <Typography sx={{ fontSize: 15, fontWeight: 700, color: line.overdue ? "error.main" : "text.primary" }}>
      {`Paga ${formatMoney(line.amount)} antes del ${dayMonthLabel(line.dueDate)}${line.overdue ? " (vencido)" : ""}`}
    </Typography>
    {line.shortToFull > 0 && (
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {`Para evitar intereses harían falta ${formatMoney(line.shortToFull)} más`}
      </Typography>
    )}
    {line.estimatedInterest !== null && (
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {`Intereses estimados este mes: ${formatMoney(line.estimatedInterest)}`}
      </Typography>
    )}
    {line.alreadyPaid > 0 && (
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {`Ya pagaste ${formatMoney(line.alreadyPaid)} desde el corte`}
      </Typography>
    )}
    <Button size="small" variant="text" onClick={onPay} sx={{ mt: 0.5, px: 0, minHeight: 44 }}>
      Registrar pago
    </Button>
  </Box>
);

interface FundsDialogProps {
  open: boolean;
  funds: FundsState | null;
  onClose: () => void;
  onSaved: (funds: FundsState) => void;
}

const FundsDialog = ({ open, funds, onClose, onSaved }: FundsDialogProps) => {
  const [amountText, setAmountText] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setSaving(false);
    setError("");
    setAmountText(funds && funds.updatedAt !== null ? String(funds.amount) : "");
  }, [open, funds]);

  const today = todayKey();
  const amountValue = toNumber(amountText);
  const amountError = amountText.trim() === "" || !(amountValue >= 0);

  const submit = async () => {
    setTouched(true);
    if (amountError) return;

    setSaving(true);
    setError("");
    try {
      const r = await api.put<FundsState>("/funds", { amount: roundMoney(amountValue), asOf: today });
      onSaved(r.data);
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el dinero disponible"));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Dinero disponible</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Monto"
            value={amountText}
            autoFocus
            onChange={(e) => setAmountText(e.target.value)}
            error={touched && amountError}
            helperText={touched && amountError ? "Escribe un monto, 0 o más" : "Lo que tienes hoy para pagar tarjetas"}
            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "Monto en pesos" } }}
            sx={{ "& input": { fontSize: 28, fontWeight: 800 } }}
          />
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{`Se guarda con la fecha de hoy: ${dateLabel(today)}.`}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const PlanView = ({ cards, statements, onChanged, onNotice }: Props) => {
  const [sources, setSources] = useState<IncomeSource[] | null>(null);
  const [funds, setFunds] = useState<FundsState | null>(null);
  const [paid, setPaid] = useState<PaidSinceCutoff[] | null>(null);
  // Cola sin conexión; se relee al cambiar y cuando se envía.
  const [queue, setQueue] = useState(() => loadOutbox());
  const [recurring, setRecurring] = useState<RecurringCharge[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fundsOpen, setFundsOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payCardId, setPayCardId] = useState<number | null>(null);
  const [paySuggested, setPaySuggested] = useState<number | null>(null);

  const loadIncome = useCallback(async () => {
    try {
      setSources((await api.get<IncomeSource[]>("/income")).data);
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err, "No se pudieron cargar los ingresos"));
    }
  }, []);

  const loadFunds = useCallback(async () => {
    try {
      setFunds((await api.get<FundsState>("/funds")).data);
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err, "No se pudo cargar el dinero disponible"));
    }
  }, []);

  // Si falla, se sigue con una lista vacía y el error queda visible; así el plan no se queda cargando para siempre.
  const loadPaid = useCallback(async () => {
    try {
      setPaid((await api.get<PaidSinceCutoff[]>("/card-payments/since-cutoff")).data);
      setLoadError("");
    } catch (err) {
      setPaid([]);
      setLoadError(errorMessage(err, "No se pudieron cargar los pagos a tarjetas"));
    }
  }, []);

  const loadRecurring = useCallback(async () => {
    try {
      setRecurring((await api.get<RecurringCharge[]>("/recurring")).data);
      setLoadError("");
    } catch (err) {
      setRecurring([]);
      setLoadError(errorMessage(err, "No se pudieron cargar los cargos recurrentes"));
    }
  }, []);

  useEffect(() => {
    void loadIncome();
    void loadFunds();
    void loadPaid();
    void loadRecurring();
  }, [loadIncome, loadFunds, loadPaid, loadRecurring]);

  // Al enviarse la cola el pago pasa al servidor: se vuelve a pedir lo pagado y se relee la cola.
  useEffect(() => {
    const onSynced = () => {
      setQueue(loadOutbox());
      void loadPaid();
    };
    window.addEventListener("outbox-synced", onSynced);
    return () => window.removeEventListener("outbox-synced", onSynced);
  }, [loadPaid]);

  // Próximo ingreso y plan. Solo entran tarjetas de crédito activas que ya tengan estado importado.
  // Los vales no pagan tarjetas, así que solo cuentan las fuentes de dinero disponible (cardId null).
  const derived = useMemo(() => {
    if (!sources || !funds || !paid) return null;

    const today = todayKey();
    const cashSources = sources.filter((s) => s.cardId == null);
    const inflows = expandIncomes(cashSources, today, shiftDays(today, HORIZON_DAYS));

    const planCards: PlanCardInput[] = [];
    for (const card of cards) {
      const statement = statements.find((s) => s.cardId === card.id);
      if (card.kind !== "credit" || !card.isActive || !statement) continue;
      // El pago del servidor cuenta solo si es del mismo corte que el estado usado; lo encolado suma aparte.
      const served = paid.find((p) => p.cardId === card.id && p.periodEnd === statement.periodEnd)?.paid ?? 0;
      planCards.push({
        cardId: card.id,
        name: cardTitle(card),
        dueDate: statement.dueDate,
        payToAvoidInterest: statement.payToAvoidInterest,
        minimumPayment: statement.minimumPayment,
        minimumPlusInstallments: statement.minimumPlusInstallments,
        annualRate: statement.annualRate ?? card.annualRate,
        paidSinceCutoff: roundMoney(served + queuedCardPaid(queue, card.id, statement.periodEnd)),
      });
    }

    return {
      inflows,
      next: nextInflow(inflows, today),
      plan: planCards.length > 0 && funds.updatedAt !== null ? buildPaymentPlan({ today, funds: funds.amount, inflows, cards: planCards }) : null,
    };
  }, [sources, funds, paid, queue, cards, statements]);

  // Flujo de caja: cobros del plan de ingresos, pagos de tarjeta del plan y cargos recurrentes.
  const cashflow = useMemo((): Cashflow | null => {
    if (!derived || !recurring || !funds || funds.updatedAt === null) return null;

    const today = todayKey();
    const to = shiftDays(today, HORIZON_DAYS);
    const cardOutflows = (derived.plan?.lines ?? [])
      .filter((line) => line.amount > 0)
      .map((line): CashEvent => ({
        date: line.dueDate,
        amount: line.amount,
        label: `Pago ${line.name}`,
        kind: "card",
        affectsBalance: true,
      }));

    return buildCashflow({
      today,
      funds: funds.amount,
      inflows: derived.inflows,
      outflows: [...cardOutflows, ...expandRecurring(recurring, cards, today, to)],
    });
  }, [derived, recurring, funds, cards]);

  return (
    <>
      {loadError && <Typography sx={{ color: "error.main", mb: 1.5 }}>{loadError}</Typography>}

      <Panel title="Dinero disponible">
        {!funds ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : funds.updatedAt === null ? (
          <>
            <Typography sx={{ fontWeight: 700 }}>Captura cuánto dinero tienes para pagar tarjetas esta quincena.</Typography>
            <Button fullWidth variant="contained" onClick={() => setFundsOpen(true)} sx={{ mt: 1.5 }}>
              Capturar
            </Button>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{formatMoney(funds.amount)}</Typography>
            {funds.asOf && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{`al ${dateLabel(funds.asOf)}`}</Typography>}
            <Button fullWidth variant="outlined" onClick={() => setFundsOpen(true)} sx={{ mt: 1.5 }}>
              Actualizar
            </Button>
          </>
        )}
      </Panel>

      <Panel title="Ingresos">
        {!derived ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : (
          <>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Próximo ingreso</Typography>
            <Typography sx={{ fontWeight: 800 }}>
              {derived.next
                ? `${derived.next.sourceName} · ${dayMonthLabel(derived.next.date)} · ${formatMoney(derived.next.amount)}`
                : `No hay ingresos en los próximos ${HORIZON_DAYS} días.`}
            </Typography>
          </>
        )}
        <Button fullWidth variant="outlined" disabled={!sources} onClick={() => setIncomeOpen(true)} sx={{ mt: 1.5 }}>
          Administrar ingresos
        </Button>
      </Panel>

      <Panel title="Plan de pagos">
        {!derived ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : !derived.plan ? (
          <Typography sx={{ fontWeight: 700 }}>
            {funds?.updatedAt === null
              ? "Captura el dinero disponible para ver el plan."
              : "Importa el estado de cuenta de tus tarjetas para ver el plan."}
          </Typography>
        ) : (
          <>
            <Typography sx={{ fontWeight: 800 }}>
              {`Asignado ${formatMoney(derived.plan.totalAllocated)} de ${formatMoney(derived.plan.funds + derived.plan.inflowsCounted)} disponibles`}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{`Sobrante: ${formatMoney(derived.plan.leftover)}`}</Typography>

            {derived.plan.warnings.map((w, i) => (
              <Alert key={i} severity="warning" sx={{ mt: 1.5 }}>
                {w}
              </Alert>
            ))}

            <Box sx={{ mt: 1.5 }}>
              {derived.plan.lines.map((line) => (
                <LineRow
                  key={line.cardId}
                  line={line}
                  onPay={() => {
                    setPayCardId(line.cardId);
                    setPaySuggested(line.amount);
                    setPaymentOpen(true);
                  }}
                />
              ))}
            </Box>

            {derived.plan.lines
              .filter((line) => line.annualRate === null)
              .map((line) => (
                <Alert key={line.cardId} severity="info" sx={{ mt: 1.5 }}>
                  {`Falta la tasa anual de ${line.name}. Agrégala al editar la tarjeta para ordenar el plan por costo.`}
                </Alert>
              ))}

            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1.5 }}>{PLAN_NOTE}</Typography>
          </>
        )}
      </Panel>

      <Panel title={`Próximos ${HORIZON_DAYS} días`}>
        {funds?.updatedAt === null ? (
          <Typography sx={{ fontWeight: 700 }}>Captura el dinero disponible para ver el flujo de los próximos días.</Typography>
        ) : !cashflow ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : (
          <>
            <Typography sx={{ fontWeight: 800 }}>
              {cashflow.lowestDate
                ? `Saldo más bajo: ${formatMoney(cashflow.lowestBalance)} el ${dayMonthLabel(cashflow.lowestDate)}`
                : `Saldo más bajo: ${formatMoney(cashflow.lowestBalance)}`}
            </Typography>
            {cashflow.firstNegativeDate && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {`Te quedas sin dinero el ${dayMonthLabel(cashflow.firstNegativeDate)}. Revisa el plan o mueve algún pago.`}
              </Alert>
            )}

            {cashflow.rows.length === 0 ? (
              <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.5 }}>No hay movimientos en este periodo.</Typography>
            ) : (
              <Box sx={{ mt: 1.5 }}>
                {cashflow.rows.map((row, i) => (
                  <Box
                    key={`${row.date}-${i}`}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      py: 1,
                      borderBottom: 1,
                      borderColor: "divider",
                      opacity: row.affectsBalance ? 1 : 0.5,
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: "text.secondary", minWidth: 56 }}>{dayMonthLabel(row.date)}</Typography>
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{row.label}</Typography>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: row.kind === "income" ? "success.main" : "text.primary" }}>
                        {`${row.kind === "income" ? "+" : "−"}${formatMoney(Math.abs(row.amount))}`}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{`Saldo ${formatMoney(row.balance)}`}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Panel>

      <FundsDialog
        open={fundsOpen}
        funds={funds}
        onClose={() => setFundsOpen(false)}
        onSaved={(saved) => {
          setFunds(saved);
          setFundsOpen(false);
          onChanged();
        }}
      />
      <IncomeDialog
        open={incomeOpen}
        sources={sources ?? []}
        cards={cards}
        onClose={() => setIncomeOpen(false)}
        onChanged={() => {
          void loadIncome();
          onChanged();
        }}
      />
      <PaymentDialog
        open={paymentOpen}
        cards={cards}
        cardId={payCardId}
        suggestedAmount={paySuggested}
        onClose={() => setPaymentOpen(false)}
        onSaved={(notice) => {
          setPaymentOpen(false);
          if (notice) onNotice?.(notice);
          setQueue(loadOutbox());
          void loadFunds();
          void loadPaid();
          onChanged();
        }}
        onDeleted={() => {
          void loadPaid();
          onChanged();
        }}
      />
    </>
  );
};

export default PlanView;
