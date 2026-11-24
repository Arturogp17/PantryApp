import { useEffect, useState, type ReactNode } from "react";
import { Box, LinearProgress, Typography } from "@mui/material";
import api from "../../api/client";
import { Card, IncomeSource, InstallmentPlan, RecurringCharge, StatementSummary } from "../../types";
import { errorMessage } from "../../lib/errors";
import { monthKey, monthLong, todayKey } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { balanceTrend, debtToIncome, installmentReleases, monthlyIncome } from "../../lib/finance";

interface Props {
  cards: Card[];
  statements: StatementSummary[];
}

const USAGE_WARN = 0.3;
const USAGE_ALERT = 0.7;

const cardTitle = (card: Card): string => (card.last4 ? `${card.name} ·${card.last4}` : card.name);

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ p: 2, mb: 1.5, bgcolor: "background.paper", borderRadius: "20px" }}>
    <Typography component="h2" sx={{ mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const HealthView = ({ cards, statements }: Props) => {
  const [sources, setSources] = useState<IncomeSource[] | null>(null);
  const [plans, setPlans] = useState<InstallmentPlan[] | null>(null);
  const [recurring, setRecurring] = useState<RecurringCharge[] | null>(null);
  const [history, setHistory] = useState<Record<number, StatementSummary[]> | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [inc, inst, rec] = await Promise.all([
          api.get<IncomeSource[]>("/income"),
          api.get<InstallmentPlan[]>("/installments"),
          api.get<RecurringCharge[]>("/recurring"),
        ]);
        if (cancelled) return;
        setSources(inc.data);
        setPlans(inst.data);
        setRecurring(rec.data);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, "No se pudieron cargar los datos de salud financiera"));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Historial de cada tarjeta de crédito que ya tiene estado importado.
  useEffect(() => {
    let cancelled = false;
    const ids = cards.filter((c) => c.kind === "credit" && statements.some((s) => s.cardId === c.id)).map((c) => c.id);
    const load = async () => {
      try {
        const results = await Promise.all(
          ids.map((id) => api.get<StatementSummary[]>("/statements", { params: { cardId: id } }))
        );
        if (cancelled) return;
        const next: Record<number, StatementSummary[]> = {};
        ids.forEach((id, i) => {
          next[id] = results[i].data;
        });
        setHistory(next);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, "No se pudo cargar el historial de estados"));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [cards, statements]);

  const today = todayKey();
  const currentKey = monthKey(new Date());
  const creditIds = new Set(cards.filter((c) => c.kind === "credit").map((c) => c.id));
  const creditStatements = statements.filter((s) => creditIds.has(s.cardId));
  const trackedCards = cards.filter((c) => creditIds.has(c.id) && creditStatements.some((s) => s.cardId === c.id));

  // Uso de crédito: saldo total contra límite, con el estado más reciente de cada tarjeta.
  const usage: { id: number; name: string; balance: number; limit: number; ratio: number }[] = [];
  for (const c of trackedCards) {
    const s = creditStatements.find((st) => st.cardId === c.id);
    if (s && s.totalBalance !== null && s.creditLimit !== null && s.creditLimit > 0) {
      usage.push({
        id: c.id,
        name: cardTitle(c),
        balance: s.totalBalance,
        limit: s.creditLimit,
        ratio: s.totalBalance / s.creditLimit,
      });
    }
  }

  // Pagos fijos al mes: mínimo (o mínimo con meses sin intereses) de cada estado, más recurrentes activos.
  const statementDebt = creditStatements.reduce((sum, s) => sum + (s.minimumPlusInstallments ?? s.minimumPayment), 0);
  const recurringMonthly = (recurring ?? [])
    .filter((r) => r.isActive)
    .reduce((sum, r) => sum + (r.frequency === "yearly" ? r.amount / 12 : r.amount), 0);
  const monthlyDebt = roundMoney(statementDebt + recurringMonthly);
  // Los vales no son ingreso disponible para pagar deudas; se muestran aparte.
  const income = sources ? monthlyIncome(sources.filter((s) => s.cardId == null)) : 0;
  const voucherIncome = sources ? monthlyIncome(sources.filter((s) => s.cardId != null)) : 0;
  const dti = sources ? debtToIncome(monthlyDebt, income) : null;

  // Meses sin intereses: lo que se libera cada mes según la fecha del último pago.
  const releases = plans ? installmentReleases(plans, today) : [];
  const releasesTotal = roundMoney(releases.reduce((sum, r) => sum + r.monthly, 0));
  const releasedByMonth = new Map<string, number>();
  for (const r of releases) {
    const key = r.lastPaymentDate.slice(0, 7);
    releasedByMonth.set(key, (releasedByMonth.get(key) ?? 0) + r.monthly);
  }
  const upcomingReleases = [...releasedByMonth.entries()]
    .filter(([key]) => key >= currentKey)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, 3);

  return (
    <>
      {loadError && <Typography sx={{ color: "error.main", mb: 1.5 }}>{loadError}</Typography>}

      <Panel title="Uso de crédito">
        {usage.length === 0 ? (
          <Typography sx={{ fontWeight: 700 }}>Importa un estado de cuenta con límite de crédito para ver el uso.</Typography>
        ) : (
          usage.map((u) => (
            <Box key={u.id} sx={{ mb: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, fontWeight: 700, fontSize: 14 }}>
                <span>{u.name}</span>
                <span>{`${Math.round(u.ratio * 100)} %`}</span>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(u.ratio * 100, 100)}
                color={u.ratio > USAGE_ALERT ? "error" : "primary"}
                aria-label={`Uso del límite de ${u.name}`}
                sx={{ mt: 0.5, height: 10, borderRadius: 5 }}
              />
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`${formatMoney(u.balance)} de ${formatMoney(u.limit)}`}</Typography>
              {u.ratio > USAGE_WARN && (
                <Typography sx={{ fontSize: 13, color: u.ratio > USAGE_ALERT ? "error.main" : "text.secondary" }}>
                  Arriba de 30 % puede afectar tu historial
                </Typography>
              )}
            </Box>
          ))
        )}
      </Panel>

      <Panel title="Ingreso comprometido">
        {!sources || !recurring ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : (
          <>
            <Typography sx={{ fontWeight: 800 }}>{`${formatMoney(monthlyDebt)} al mes en pagos fijos`}</Typography>
            {dti === null ? (
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Captura tus ingresos en Plan para ver este dato</Typography>
            ) : (
              <Typography sx={{ fontWeight: 700 }}>{`${Math.round(dti * 100)} % de tu ingreso mensual se va a pagos fijos`}</Typography>
            )}
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>Menos de 35 % suele considerarse manejable</Typography>
            {voucherIncome > 0 && (
              <Typography sx={{ fontSize: 13, color: "text.secondary", opacity: 0.7, mt: 1 }}>
                {`Además recibes ${formatMoney(voucherIncome)} al mes en vales`}
              </Typography>
            )}
          </>
        )}
      </Panel>

      <Panel title="Meses sin intereses">
        {!plans ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : releases.length === 0 ? (
          <Typography sx={{ fontWeight: 700 }}>No tienes meses sin intereses activos.</Typography>
        ) : (
          <>
            <Typography sx={{ fontWeight: 800 }}>{`Total mensual comprometido: ${formatMoney(releasesTotal)}`}</Typography>
            {upcomingReleases.map(([key, total]) => (
              <Typography key={key} sx={{ fontSize: 14, fontWeight: 700 }}>
                {`En ${monthLong(key)} se liberan ${formatMoney(roundMoney(total))}`}
              </Typography>
            ))}
            <Box sx={{ mt: 1.5 }}>
              {releases.map((r, i) => (
                <Box key={`${r.cardId}-${r.lastPaymentDate}-${i}`} sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
                  <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{r.name}</Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {`${formatMoney(r.monthly)} al mes · termina en ${monthLong(r.lastPaymentDate.slice(0, 7))} (faltan ${r.remainingPayments})`}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Panel>

      <Panel title="Tendencia de deuda">
        {trackedCards.length === 0 ? (
          <Typography sx={{ fontWeight: 700 }}>Importa un estado de cuenta para ver la tendencia.</Typography>
        ) : !history ? (
          <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
        ) : (
          trackedCards.map((c) => {
            const trend = balanceTrend(history[c.id] ?? []);
            return (
              <Box key={c.id} sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{cardTitle(c)}</Typography>
                {trend === null ? (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Hace falta otro estado para comparar</Typography>
                ) : trend.change < 0 ? (
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "success.main" }}>
                    {`Bajó ${formatMoney(roundMoney(-trend.change))} desde el estado anterior`}
                  </Typography>
                ) : trend.change > 0 ? (
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "error.main" }}>
                    {`Subió ${formatMoney(roundMoney(trend.change))} desde el estado anterior`}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sin cambio desde el estado anterior</Typography>
                )}
              </Box>
            );
          })
        )}
      </Panel>
    </>
  );
};

export default HealthView;
