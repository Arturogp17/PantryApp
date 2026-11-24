import { ReactNode, useEffect, useMemo, useState } from "react";
import { Box, Button, ButtonBase, Typography } from "@mui/material";
import api from "../../api/client";
import { RecurringCharge } from "../../types";
import { errorMessage } from "../../lib/errors";
import { monthShort } from "../../lib/expenses";
import { formatMoney, roundMoney } from "../../lib/money";
import { useAppTheme } from "../../theme/ThemeContext";
import { Dot } from "./charts";

const CASH_COLOR = "#E0B13D";

interface Props {
  version: number;
  onAdd: () => void;
  onEdit: (item: RecurringCharge) => void;
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ p: 2, mb: 1.5, bgcolor: "background.paper", borderRadius: "20px" }}>
    <Typography component="h2" sx={{ mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const ChargeRow = ({ item, heroBg, heroText, border, onClick }: { item: RecurringCharge; heroBg: string; heroText: string; border: string; onClick: () => void }) => (
  <ButtonBase
    onClick={onClick}
    aria-label={`Editar ${item.name}`}
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 1.5,
      width: "100%",
      textAlign: "left",
      py: 1.25,
      px: 0.5,
      borderRadius: "14px",
      opacity: item.isActive ? 1 : 0.6,
    }}
  >
    <Box sx={{ flex: "0 0 52px", textAlign: "center", py: 0.75, borderRadius: "14px", bgcolor: heroBg, color: heroText, border }}>
      <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: "inherit" }}>{Number(item.nextDate.slice(8, 10))}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "inherit" }}>{monthShort(item.nextDate.slice(0, 7))}</Typography>
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{item.name}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Dot color={item.cardColor ?? CASH_COLOR} size={10} />
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>
          {item.cardName ?? "Efectivo"} · {item.frequency === "monthly" ? "mensual" : "anual"}
          {item.isActive ? "" : " · desactivado"}
        </Typography>
      </Box>
    </Box>
    <Typography sx={{ flex: "0 0 auto", fontWeight: 800 }}>{formatMoney(item.amount)}</Typography>
  </ButtonBase>
);

const RecurringView = ({ version, onAdd, onEdit }: Props) => {
  const { tokens } = useAppTheme();
  const [items, setItems] = useState<RecurringCharge[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<RecurringCharge[]>("/recurring")
      .then((r) => {
        if (cancelled) return;
        setItems(r.data);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "No se pudieron cargar los recurrentes"));
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Inactivos al final; entre los activos, el próximo cobro primero.
  const ordered = useMemo(
    () =>
      [...(items ?? [])].sort(
        (a, b) =>
          Number(!a.isActive) - Number(!b.isActive) || a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name)
      ),
    [items]
  );

  if (!items) {
    return error ? (
      <Typography sx={{ color: "error.main" }}>{error}</Typography>
    ) : (
      <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>
    );
  }

  const fixedMonthly = roundMoney(
    ordered.filter((i) => i.isActive && i.frequency === "monthly").reduce((sum, i) => sum + i.amount, 0)
  );
  const annualCount = ordered.filter((i) => i.isActive && i.frequency === "yearly").length;

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
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: tokens.heroLabel }}>Total fijo al mes</Typography>
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
          {formatMoney(fixedMonthly)}
        </Typography>
        {annualCount > 0 && (
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: tokens.heroLabel }}>
            {annualCount} {annualCount === 1 ? "cargo anual" : "cargos anuales"}
          </Typography>
        )}
      </Box>

      <Panel title="Próximos cobros">
        {ordered.length === 0 && <Typography sx={{ fontWeight: 700 }}>Todavía no hay cargos recurrentes. Agrega uno con el botón de abajo.</Typography>}
        {ordered.map((item) => (
          <ChargeRow
            key={item.id}
            item={item}
            heroBg={tokens.heroBg}
            heroText={tokens.heroText}
            border={tokens.border}
            onClick={() => onEdit(item)}
          />
        ))}
      </Panel>

      <Box sx={{ mt: 2 }}>
        <Button fullWidth variant="contained" onClick={onAdd}>
          Agregar recurrente
        </Button>
      </Box>
    </>
  );
};

export default RecurringView;
