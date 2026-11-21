import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Collapse, Typography } from "@mui/material";
import api from "../api/client";
import { PurchaseResponse, PurchaseSummary } from "../types";
import { useAppTheme } from "../theme/ThemeContext";
import { rowStyle } from "../theme/rowStyle";
import { errorMessage } from "../lib/errors";
import { formatMoney, formatQuantity } from "../lib/money";
import { promoLabel } from "../lib/promo";
import { unitLabel } from "../lib/units";

const PAGE = 20;

type Period = "month" | "lastMonth" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
];

// Inicio y fin del periodo en hora local, enviados al API como instantes UTC.
function periodRange(period: Period): { from?: string; to?: string } {
  if (period === "all") return {};

  const now = new Date();
  const offset = period === "month" ? 0 : -1;
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

const dateFormat = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const Compras = () => {
  const { tokens } = useAppTheme();
  const [period, setPeriod] = useState<Period>("month");
  const [summary, setSummary] = useState<PurchaseSummary | null>(null);
  const [purchases, setPurchases] = useState<PurchaseResponse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sum, list] = await Promise.all([
        api.get<PurchaseSummary>("/purchases/summary", { params: periodRange(period) }),
        api.get<PurchaseResponse[]>("/purchases", { params: { take: PAGE, skip: 0 } }),
      ]);
      setSummary(sum.data);
      setPurchases(list.data);
      setHasMore(list.data.length === PAGE);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar las compras"));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    try {
      const list = await api.get<PurchaseResponse[]>("/purchases", {
        params: { take: PAGE, skip: purchases.length },
      });
      setPurchases((prev) => [...prev, ...list.data]);
      setHasMore(list.data.length === PAGE);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar más compras"));
    }
  };

  const maxSpent = useMemo(() => Math.max(1, ...(summary?.byProduct.map((p) => p.spent) ?? [1])), [summary]);

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: 6 }}>
      <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1 }}>
        Compras
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
        Lo que han gastado y en qué.
      </Typography>

      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {PERIODS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            clickable
            color={period === p.id ? "primary" : "default"}
            variant={period === p.id ? "filled" : "outlined"}
            onClick={() => setPeriod(p.id)}
          />
        ))}
      </Box>

      {error && <Typography sx={{ color: "error.main", mb: 2 }}>{error}</Typography>}

      <Box
        sx={{
          p: 2.5,
          mb: 3,
          bgcolor: tokens.heroBg,
          color: tokens.heroText,
          borderRadius: `${Math.round(tokens.radius * 1.4)}px`,
          border: tokens.border,
          boxShadow: tokens.shadow,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: tokens.heroLabel }}>Gastaron</Typography>
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
          {formatMoney(summary?.totalSpent ?? 0)}
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: tokens.heroLabel }}>
          {summary?.purchaseCount ?? 0} {summary?.purchaseCount === 1 ? "compra" : "compras"}
          {summary && summary.savings > 0 ? ` · ahorraron ${formatMoney(summary.savings)} con promociones` : ""}
        </Typography>
      </Box>

      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>
        En qué
      </Typography>
      {!loading && summary?.byProduct.length === 0 && (
        <Typography sx={{ color: "text.secondary", mb: 3 }}>No hay compras en este periodo.</Typography>
      )}
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mb: 3 }}>
        {summary?.byProduct.slice(0, 15).map((p) => (
          <Box component="li" key={p.productId} sx={{ py: 1, ...rowStyle(tokens) }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere", textTransform: tokens.uppercaseNames ? "uppercase" : "none" }}>
                {p.name}
              </Typography>
              <Typography sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{formatMoney(p.spent)}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {formatQuantity(p.quantity)} {unitLabel(p.stockType)} en {p.times} {p.times === 1 ? "compra" : "compras"}
            </Typography>
            <Box aria-hidden="true" sx={{ mt: 0.5, height: 6, bgcolor: tokens.line, borderRadius: 3 }}>
              <Box sx={{ width: `${(p.spent / maxSpent) * 100}%`, height: "100%", bgcolor: tokens.primary, borderRadius: 3 }} />
            </Box>
          </Box>
        ))}
      </Box>

      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>
        Historial
      </Typography>
      {!loading && purchases.length === 0 && <Typography sx={{ color: "text.secondary" }}>Todavía no hay compras.</Typography>}

      {purchases.map((purchase) => {
        const open = openId === purchase.id;

        return (
          <Box key={purchase.id} sx={{ ...rowStyle(tokens), py: 0.5 }}>
            <Button
              fullWidth
              onClick={() => setOpenId(open ? null : purchase.id)}
              aria-expanded={open}
              sx={{ justifyContent: "space-between", textAlign: "left", border: "none", boxShadow: "none", minHeight: 52 }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{dateFormat.format(new Date(purchase.purchaseDate))}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {purchase.items.length} {purchase.items.length === 1 ? "producto" : "productos"}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 800 }}>{formatMoney(purchase.totalAmount)}</Typography>
            </Button>

            <Collapse in={open} unmountOnExit>
              <Box component="ul" sx={{ listStyle: "none", m: 0, px: 1.5, pb: 1 }}>
                {purchase.items.map((item) => (
                  <Box component="li" key={`${purchase.id}-${item.productId}`} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
                    <Box>
                      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                        {item.productName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {formatQuantity(item.quantity)} {unitLabel(item.stockType)} × {formatMoney(item.unitPrice)}
                        {item.promo ? ` · ${promoLabel(item.promo)}` : ""}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      {formatMoney(item.lineTotal)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {hasMore && (
        <Button fullWidth variant="outlined" onClick={loadMore} sx={{ mt: 2 }}>
          Ver más
        </Button>
      )}
    </Box>
  );
};

export default Compras;
