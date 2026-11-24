import type { ReactNode } from "react";
import { Box, Button, ButtonBase, LinearProgress, Typography } from "@mui/material";
import { Card, ExpenseSummary, IncomeSource, PaidSinceCutoff, StatementSummary } from "../../types";
import { formatMoney, roundMoney } from "../../lib/money";
import { dayMonthLabel, daysUntil } from "../../lib/expenses";
import { monthlyIncome } from "../../lib/finance";
import { loadOutbox, queuedCardPaid } from "../../lib/outbox";

interface Props {
  cards: Card[];
  summary: ExpenseSummary | null;
  statements: StatementSummary[];
  paidSinceCutoff: PaidSinceCutoff[];
  incomes: IncomeSource[];
  onEdit: (card: Card) => void;
  onAdd: () => void;
  onImport: () => void;
  onCategories: () => void;
  onPay: () => void;
}

const KIND_LABEL: Record<Card["kind"], string> = { credit: "Crédito", debit: "Débito", voucher: "Vales" };

const plural = (n: number): string => (n === 1 ? "día" : "días");

// "en 17 días", "hoy" o "venció hace 3 días". Solo lo vencido va en color de aviso.
const dueStatus = (dueDate: string): { text: string; overdue: boolean } => {
  const days = daysUntil(dueDate);
  if (days < 0) return { text: `venció hace ${-days} ${plural(-days)}`, overdue: true };
  if (days === 0) return { text: "hoy", overdue: false };
  return { text: `en ${days} ${plural(days)}`, overdue: false };
};

// paid: lo pagado desde el corte de este estado; undefined si no hay dato para ese corte.
const debtBlock = (statement: StatementSummary | undefined, paid: number | undefined) => {
  if (!statement) {
    return (
      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sin estado importado</Typography>
      </Box>
    );
  }

  const status = dueStatus(statement.dueDate);
  const limit = statement.creditLimit;
  const usage =
    statement.totalBalance !== null && limit !== null && limit > 0
      ? Math.min(100, (statement.totalBalance / limit) * 100)
      : null;

  return (
    <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Deuda actual</Typography>
      <Box sx={{ display: "flex", gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Saldo total</Typography>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>
            {statement.totalBalance === null ? "Sin dato" : formatMoney(statement.totalBalance)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Para no generar intereses</Typography>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>{formatMoney(statement.payToAvoidInterest)}</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 1, color: status.overdue ? "error.main" : "text.primary" }}>
        {`Vence el ${dayMonthLabel(statement.dueDate)} (${status.text})`}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`Pago mínimo ${formatMoney(statement.minimumPayment)}`}</Typography>
      {paid !== undefined && paid > 0 && (
        <>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 1 }}>{`Pagado desde el corte: ${formatMoney(paid)}`}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {`Falta para no generar intereses: ${formatMoney(roundMoney(Math.max(0, statement.payToAvoidInterest - paid)))}`}
          </Typography>
        </>
      )}
      {usage !== null && limit !== null && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress variant="determinate" value={usage} aria-label="Uso del límite" sx={{ height: 8, borderRadius: 4 }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
            {`${Math.round(usage)}% de ${formatMoney(limit)}`}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const TarjetasView = ({ cards, summary, statements, paidSinceCutoff, incomes, onEdit, onAdd, onImport, onCategories, onPay }: Props) => {
  const spentBy = (cardId: number | null): number =>
    summary?.byMethod.find((m) => m.cardId === cardId)?.total ?? 0;

  // Pagos encolados sin conexión; Gastos vuelve a pintar al enviarse la cola, así que se leen aquí.
  const queue = loadOutbox();

  // Solo cuenta el pago del servidor si el corte que trae coincide con el del estado mostrado. Lo encolado suma aparte.
  const debtFor = (card: Card) => {
    const statement = statements.find((s) => s.cardId === card.id);
    const served = statement
      ? paidSinceCutoff.find((p) => p.cardId === card.id && p.periodEnd === statement.periodEnd)?.paid
      : undefined;
    const paid = statement ? roundMoney((served ?? 0) + queuedCardPaid(queue, card.id, statement.periodEnd)) : undefined;
    return debtBlock(statement, paid);
  };

  // Depósito del mes de esa tarjeta (mensual 1 vez, quincenal 2) menos lo gastado con ella este mes.
  const voucherBlock = (card: Card) => {
    const deposit = roundMoney(monthlyIncome(incomes.filter((s) => s.cardId === card.id)));
    const left = roundMoney(deposit - spentBy(card.id));
    return (
      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Saldo de vales este mes</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`Depósito del mes ${formatMoney(deposit)}`}</Typography>
        {summary === null ? (
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: "text.secondary" }}>Cargando…</Typography>
        ) : (
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: left < 0 ? "error.main" : "text.primary" }}>
            {left < 0 ? `Te pasaste por ${formatMoney(roundMoney(-left))}` : `Te quedan ${formatMoney(left)}`}
          </Typography>
        )}
      </Box>
    );
  };

  const tile = (
    key: string,
    color: string,
    fg: string,
    name: string,
    kind: string,
    spent: number,
    extra?: string,
    onClick?: () => void,
    inactive?: boolean,
    footer?: ReactNode
  ) => {
    const content = (
      <>
        <Box sx={{ px: 2, py: 1.5, bgcolor: color, color: fg }}>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: "inherit" }}>{name}</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "inherit" }}>
            {kind}
            {inactive ? " · desactivada" : ""}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, px: 2, py: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Gastado este mes</Typography>
            <Typography sx={{ fontSize: 17, fontWeight: 800 }}>{formatMoney(spent)}</Typography>
          </Box>
          {extra && (
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Corte y pago</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{extra}</Typography>
            </Box>
          )}
        </Box>
        {footer}
      </>
    );

    const shared = { width: "100%", mb: 1.5, bgcolor: "background.paper", borderRadius: "20px", overflow: "hidden", opacity: inactive ? 0.6 : 1 };

    return onClick ? (
      <ButtonBase key={key} onClick={onClick} aria-label={`Editar ${name}`} sx={{ ...shared, display: "block", textAlign: "left" }}>
        {content}
      </ButtonBase>
    ) : (
      <Box key={key} sx={shared}>
        {content}
      </Box>
    );
  };

  return (
    <>
      <Button fullWidth variant="outlined" onClick={onPay} sx={{ mb: 1.5 }}>
        Registrar pago
      </Button>
      {cards.map((c) =>
        tile(
          `c${c.id}`,
          c.color,
          "#FFFFFF",
          c.last4 ? `${c.name} ·${c.last4}` : c.name,
          `${KIND_LABEL[c.kind]}${c.bank ? ` · ${c.bank}` : ""}`,
          spentBy(c.id),
          c.kind === "credit" && (c.cutoffDay || c.dueDay)
            ? `${c.cutoffDay ? `día ${c.cutoffDay}` : "—"} · ${c.dueDay ? `día ${c.dueDay}` : "—"}`
            : undefined,
          () => onEdit(c),
          !c.isActive,
          c.kind === "credit" ? debtFor(c) : c.kind === "voucher" ? voucherBlock(c) : undefined
        )
      )}
      {tile("cash", "#E0B13D", "#1F2A0E", "Efectivo", "Sin tarjeta", spentBy(null))}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}>
        <Button fullWidth variant="contained" onClick={onImport}>
          Importar estado de cuenta
        </Button>
        <Button fullWidth variant="contained" onClick={onAdd}>
          Agregar tarjeta
        </Button>
        <Button fullWidth variant="outlined" onClick={onCategories}>
          Administrar categorías
        </Button>
      </Box>
    </>
  );
};

export default TarjetasView;
