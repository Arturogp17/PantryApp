import { ReactNode, useEffect, useMemo, useState } from "react";
import { Box, Button, ButtonBase, Typography } from "@mui/material";
import api from "../../api/client";
import { CommitmentsResponse, InstallmentPlan } from "../../types";
import { errorMessage } from "../../lib/errors";
import { buildCommitmentChart, monthKey, monthLong } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { useAppTheme } from "../../theme/ThemeContext";
import { Dot, StackedBars } from "./charts";

const MONTHS_AHEAD = 6;

interface Props {
  version: number;
  onAdd: () => void;
  onEdit: (plan: InstallmentPlan) => void;
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ p: 2, mb: 1.5, bgcolor: "background.paper", borderRadius: "20px" }}>
    <Typography component="h2" sx={{ mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const PlanTile = ({ plan, track, onClick }: { plan: InstallmentPlan; track: string; onClick: () => void }) => {
  const pct = plan.months > 0 ? Math.min(100, (plan.paidCount / plan.months) * 100) : 0;

  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`Editar ${plan.name}`}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        mb: 1.25,
        p: 2,
        bgcolor: "background.paper",
        borderRadius: "20px",
        opacity: plan.isFinished ? 0.6 : 1,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{plan.name}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
            <Dot color={plan.cardColor} size={10} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>{plan.cardName}</Typography>
          </Box>
        </Box>
        <Box sx={{ flex: "0 0 auto", textAlign: "right" }}>
          <Typography sx={{ fontWeight: 800 }}>{formatMoney(plan.monthlyAmount)}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>al mes</Typography>
        </Box>
      </Box>

      <Box
        role="progressbar"
        aria-label="Mensualidades pagadas"
        aria-valuemin={0}
        aria-valuemax={plan.months}
        aria-valuenow={plan.paidCount}
        sx={{ mt: 1.5, height: 10, borderRadius: 5, bgcolor: track, overflow: "hidden" }}
      >
        <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 5, bgcolor: plan.cardColor }} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mt: 1, fontSize: 13, fontWeight: 700 }}>
        <span>
          {plan.paidCount} de {plan.months} mensualidades
        </span>
        <span>{plan.isFinished ? "Pagado" : `Faltan ${formatMoney(plan.remainingAmount)}`}</span>
      </Box>
      <Typography sx={{ mt: 0.5, fontSize: 13, color: "text.secondary" }}>
        Termina en {monthLong(plan.lastPaymentDate.slice(0, 7))}
      </Typography>
    </ButtonBase>
  );
};

const InstallmentsView = ({ version, onAdd, onEdit }: Props) => {
  const { tokens } = useAppTheme();
  const [plans, setPlans] = useState<InstallmentPlan[] | null>(null);
  const [commitments, setCommitments] = useState<CommitmentsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const month = monthKey(new Date());
    Promise.all([
      api.get<InstallmentPlan[]>("/installments"),
      api.get<CommitmentsResponse>("/commitments", { params: { month, count: MONTHS_AHEAD } }),
    ])
      .then(([plansRes, commitmentsRes]) => {
        if (cancelled) return;
        setPlans(plansRes.data);
        setCommitments(commitmentsRes.data);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "No se pudieron cargar los planes"));
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const chart = useMemo(() => buildCommitmentChart(commitments?.months ?? []), [commitments]);

  // Terminados al final; entre los que siguen, el que termina primero va arriba.
  const ordered = useMemo(
    () =>
      [...(plans ?? [])].sort(
        (a, b) =>
          Number(a.isFinished) - Number(b.isFinished) ||
          a.lastPaymentDate.localeCompare(b.lastPaymentDate) ||
          a.name.localeCompare(b.name)
      ),
    [plans]
  );

  if (!plans || !commitments) {
    return error ? (
      <Typography sx={{ color: "error.main" }}>{error}</Typography>
    ) : (
      <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
    );
  }

  const payingNow = commitments.months[0]?.installmentsTotal ?? 0;
  const unfinished = plans.filter((p) => !p.isFinished);
  const pending = roundMoney(unfinished.reduce((sum, p) => sum + p.remainingAmount, 0));

  return (
    <>
      <Box
        sx={{
          p: 2.5,
          mb: 1.5,
          bgcolor: tokens.heroBg,
          color: tokens.heroText,
          borderRadius: `${Math.round(tokens.radius * 1.4)}px`,
          border: tokens.border,
          boxShadow: tokens.shadow,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: tokens.heroLabel }}>En planes este mes</Typography>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontFamily: tokens.fontDisplay,
            fontSize: `${tokens.totalSize / 16}rem`,
            fontWeight: tokens.totalWeight,
            letterSpacing: tokens.totalTracking,
            lineHeight: 1.1,
          }}
        >
          {formatMoney(payingNow)}
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: tokens.heroLabel }}>
          Faltan {formatMoney(pending)} en {unfinished.length} {unfinished.length === 1 ? "plan sin terminar" : "planes sin terminar"}
        </Typography>
      </Box>

      <Panel title="Próximos meses">
        {chart.months.length > 0 ? (
          <StackedBars months={chart.months} series={chart.series} currentKey="" />
        ) : (
          <Typography sx={{ color: "text.secondary" }}>No hay pagos en los próximos meses.</Typography>
        )}
      </Panel>

      <Typography component="h2" sx={{ mt: 2, mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
        Planes
      </Typography>

      {ordered.length === 0 && (
        <Typography sx={{ mb: 1.5, fontWeight: 700 }}>Todavía no hay planes. Agrega uno con el botón de abajo.</Typography>
      )}

      {ordered.map((plan) => (
        <PlanTile key={plan.id} plan={plan} track={tokens.line} onClick={() => onEdit(plan)} />
      ))}

      <Box sx={{ mt: 2 }}>
        <Button fullWidth variant="contained" onClick={onAdd}>
          Agregar plan
        </Button>
      </Box>
    </>
  );
};

export default InstallmentsView;
