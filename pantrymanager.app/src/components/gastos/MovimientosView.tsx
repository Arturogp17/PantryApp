import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, ButtonBase, Chip, MenuItem, TextField, Typography } from "@mui/material";
import api from "../../api/client";
import { Card, Expense, ExpenseCategory } from "../../types";
import { errorMessage } from "../../lib/errors";
import { dayLabel, monthRange } from "../../lib/expenses";
import { formatMoney } from "../../lib/money";
import { Dot } from "./charts";

const PAGE = 30;

interface Props {
  month: string;
  cards: Card[];
  categories: ExpenseCategory[];
  version: number;
  onEdit: (expense: Expense) => void;
}

// "cash" = solo efectivo, un número = esa tarjeta, null = todos.
type MethodFilter = "cash" | number | null;

const MovimientosView = ({ month, cards, categories, version, onEdit }: Props) => {
  const [method, setMethod] = useState<MethodFilter>(null);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string | number | boolean> = { ...monthRange(month), take: PAGE };
    if (method === "cash") p.cash = true;
    else if (method !== null) p.cardId = method;
    if (categoryId !== "") p.categoryId = categoryId;
    return p;
  }, [month, method, categoryId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get<Expense[]>("/expenses", { params: { ...params, skip: 0 } });
      setExpenses(r.data);
      setHasMore(r.data.length === PAGE);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los gastos"));
    } finally {
      setLoading(false);
    }
  }, [params]);

  // "version" cambia cuando se guarda o borra un gasto desde fuera de esta vista.
  useEffect(() => {
    load();
  }, [load, version]);

  const loadMore = async () => {
    try {
      const r = await api.get<Expense[]>("/expenses", { params: { ...params, skip: expenses.length } });
      setExpenses((prev) => [...prev, ...r.data]);
      setHasMore(r.data.length === PAGE);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar más gastos"));
    }
  };

  const days = useMemo(() => {
    const groups: { date: string; total: number; items: Expense[] }[] = [];
    for (const e of expenses) {
      let g = groups[groups.length - 1];
      if (!g || g.date !== e.date) {
        g = { date: e.date, total: 0, items: [] };
        groups.push(g);
      }
      g.items.push(e);
      g.total += e.amount;
    }
    return groups;
  }, [expenses]);

  const parents = categories.filter((c) => c.parentId === null);

  return (
    <>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Chip
          label="Todos"
          clickable
          color={method === null ? "primary" : "default"}
          variant={method === null ? "filled" : "outlined"}
          onClick={() => setMethod(null)}
          sx={{ height: 44 }}
        />
        {cards.filter((c) => c.isActive).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            clickable
            icon={<Dot color={c.color} size={10} />}
            color={method === c.id ? "primary" : "default"}
            variant={method === c.id ? "filled" : "outlined"}
            onClick={() => setMethod(c.id)}
            sx={{ height: 44 }}
          />
        ))}
        <Chip
          label="Efectivo"
          clickable
          icon={<Dot color="#E0B13D" size={10} />}
          color={method === "cash" ? "primary" : "default"}
          variant={method === "cash" ? "filled" : "outlined"}
          onClick={() => setMethod("cash")}
          sx={{ height: 44 }}
        />
      </Box>

      <TextField
        select
        label="Categoría"
        size="small"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ mb: 2, minWidth: 200 }}
      >
        <MenuItem value="">Todas</MenuItem>
        {parents.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      {error && <Typography sx={{ color: "error.main", mb: 2 }}>{error}</Typography>}
      {!loading && expenses.length === 0 && !error && (
        <Typography sx={{ fontWeight: 700 }}>No hay gastos con estos filtros.</Typography>
      )}

      {days.map((g) => (
        <Box key={g.date} sx={{ mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", px: 0.5, mb: 0.5, fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            <span>{dayLabel(g.date)}</span>
            <span>{formatMoney(g.total)}</span>
          </Box>
          <Box sx={{ bgcolor: "background.paper", borderRadius: "20px", px: 2, py: 0.5 }}>
            {g.items.map((e, i) => (
              <ButtonBase
                key={e.id}
                onClick={() => onEdit(e)}
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  textAlign: "left",
                  gap: 1.5,
                  minHeight: 64,
                  py: 1,
                  borderTop: i === 0 ? "none" : "1px solid",
                  borderColor: "divider",
                }}
              >
                <Dot color={e.methodColor} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{e.merchant || e.categoryName}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    {e.parentCategoryName ? `${e.parentCategoryName} · ${e.categoryName}` : e.categoryName} · {e.methodName} · {e.createdBy}
                  </Typography>
                  {e.note && (
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontStyle: "italic" }}>
                      {e.note}
                    </Typography>
                  )}
                </Box>
                <Typography sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{formatMoney(e.amount)}</Typography>
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}

      {hasMore && (
        <Button fullWidth variant="outlined" onClick={loadMore} sx={{ mt: 1 }}>
          Ver más
        </Button>
      )}
    </>
  );
};

export default MovimientosView;
