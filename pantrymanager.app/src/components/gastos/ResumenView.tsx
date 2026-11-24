import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, ButtonBase, Collapse, LinearProgress, Typography } from "@mui/material";
import api from "../../api/client";
import { Card, CategoryBudget, ExpenseCategory, ExpenseSummary } from "../../types";
import { errorMessage } from "../../lib/errors";
import { buildMonthChart, monthLong } from "../../lib/expenses";
import { budgetStatus, type BudgetLevel } from "../../lib/finance";
import { formatMoney } from "../../lib/money";
import { useAppTheme } from "../../theme/ThemeContext";
import { Donut, StackedBars } from "./charts";
import BudgetDialog from "./BudgetDialog";

interface Props {
  summary: ExpenseSummary | null;
  categories: ExpenseCategory[];
  cards: Card[];
  currentKey: string;
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box sx={{ p: 2, mb: 1.5, bgcolor: "background.paper", borderRadius: "20px" }}>
    <Typography component="h2" sx={{ mb: 1.25, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const BUDGET_COLOR: Record<BudgetLevel, "primary" | "warning" | "error"> = {
  ok: "primary",
  warn: "warning",
  over: "error",
};

const ResumenView = ({ summary, categories, currentKey }: Props) => {
  const { tokens } = useAppTheme();
  const [openId, setOpenId] = useState<number | null>(null);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [budgetsError, setBudgetsError] = useState("");
  const [budgetOpen, setBudgetOpen] = useState(false);

  const loadBudgets = useCallback(async () => {
    try {
      setBudgets((await api.get<CategoryBudget[]>("/budgets")).data);
      setBudgetsError("");
    } catch (err) {
      setBudgetsError(errorMessage(err, "No se pudieron cargar los presupuestos"));
    }
  }, []);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  const chart = useMemo(
    () => (summary ? buildMonthChart(summary.byMonth, categories) : { months: [], series: [] }),
    [summary, categories]
  );

  // Gasto del mes de cada categoría principal con presupuesto. El gasto de la principal ya incluye sus subcategorías.
  const budgetRows = useMemo(() => {
    const parentNames = new Map(categories.filter((c) => c.parentId === null).map((c): [number, string] => [c.id, c.name]));
    const spentById = new Map((summary?.byCategory ?? []).map((c): [number, number] => [c.categoryId, c.total]));
    return budgets
      .filter((b) => parentNames.has(b.categoryId))
      .map((b) => {
        const spent = spentById.get(b.categoryId) ?? 0;
        return {
          categoryId: b.categoryId,
          name: parentNames.get(b.categoryId) ?? "",
          budget: b.monthlyAmount,
          spent,
          ...budgetStatus(spent, b.monthlyAmount),
        };
      });
  }, [budgets, categories, summary]);

  if (!summary) return <Typography sx={{ color: "text.secondary" }}>Cargando…</Typography>;

  const maxCategory = Math.max(1, ...summary.byCategory.map((c) => c.total));
  const isCurrent = summary.month === currentKey;

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
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: tokens.heroLabel }}>
          {isCurrent ? "Gastado en" : "Gastaron en"} {monthLong(summary.month)}
        </Typography>
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
          {formatMoney(summary.total)}
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: tokens.heroLabel }}>
          {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
          {summary.previousMonthTotal > 0 ? ` · el mes anterior fueron ${formatMoney(summary.previousMonthTotal)}` : ""}
        </Typography>
      </Box>

      {summary.count === 0 && (
        <Typography sx={{ mb: 1.5, fontWeight: 700 }}>Todavía no hay gastos este mes. Agrega el primero con el botón de abajo.</Typography>
      )}

      <Panel title="Por mes">
        <StackedBars months={chart.months} series={chart.series} currentKey={currentKey} />
        {chart.months.some((m) => m.key === currentKey) && (
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            El mes con borde punteado todavía no termina.
          </Typography>
        )}
      </Panel>

      {summary.byCategory.length > 0 && (
        <Panel title="En qué">
          {summary.byCategory.map((c) => {
            const open = openId === c.categoryId;
            const hasChildren = c.children.length > 0;
            return (
              <Box key={c.categoryId} sx={{ mb: 1.25 }}>
                {(() => {
                  const content = (
                    <>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, fontWeight: 700, fontSize: 14 }}>
                        <span>
                          {c.name}
                          {hasChildren ? (open ? " ▴" : " ▾") : ""}
                        </span>
                        <span>{formatMoney(c.total)}</span>
                      </Box>
                      <Box aria-hidden="true" sx={{ mt: 0.5, height: 10, borderRadius: 5, bgcolor: tokens.line }}>
                        <Box sx={{ width: `${(c.total / maxCategory) * 100}%`, height: "100%", borderRadius: 5, bgcolor: c.color }} />
                      </Box>
                    </>
                  );
                  return hasChildren ? (
                    <ButtonBase
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : c.categoryId)}
                      sx={{ display: "block", width: "100%", textAlign: "left", minHeight: 44, borderRadius: 1 }}
                    >
                      {content}
                    </ButtonBase>
                  ) : (
                    <Box sx={{ minHeight: 44 }}>{content}</Box>
                  );
                })()}
                <Collapse in={open} unmountOnExit>
                  <Box sx={{ pl: 2, pt: 0.5 }}>
                    {c.children.map((s) => (
                      <Box key={s.categoryId} sx={{ display: "flex", justifyContent: "space-between", fontSize: 13, py: 0.25 }}>
                        <span>{s.name}</span>
                        <span>{formatMoney(s.total)}</span>
                      </Box>
                    ))}
                    {c.total - c.children.reduce((sum, s) => sum + s.total, 0) > 0 && (
                      <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 13, py: 0.25, color: "text.secondary" }}>
                        <span>Sin subcategoría</span>
                        <span>{formatMoney(c.total - c.children.reduce((sum, s) => sum + s.total, 0))}</span>
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Panel>
      )}

      <Panel title="Presupuesto del mes">
        {budgetsError && <Typography sx={{ color: "error.main", mb: 1 }}>{budgetsError}</Typography>}
        {budgetRows.length === 0 ? (
          <Typography sx={{ fontWeight: 700 }}>Todavía no tienes presupuestos. Pon un tope mensual a una categoría.</Typography>
        ) : (
          budgetRows.map((row) => (
            <Box key={row.categoryId} sx={{ mb: 1.25 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, fontWeight: 700, fontSize: 14 }}>
                <span>{row.name}</span>
                <span>{`${formatMoney(row.spent)} de ${formatMoney(row.budget)}`}</span>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(row.ratio * 100, 100)}
                color={BUDGET_COLOR[row.level]}
                aria-label={`Gasto de ${row.name} frente al presupuesto`}
                sx={{ mt: 0.5, height: 10, borderRadius: 5 }}
              />
              {row.level === "over" && (
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: "error.main" }}>
                  {`Te pasaste por ${formatMoney(row.spent - row.budget)}`}
                </Typography>
              )}
              {row.level === "warn" && (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`Llevas el ${Math.round(row.ratio * 100)} %`}</Typography>
              )}
            </Box>
          ))
        )}
        <Button variant="text" onClick={() => setBudgetOpen(true)} sx={{ minHeight: 44, mt: 0.5 }}>
          Editar presupuestos
        </Button>
      </Panel>

      {summary.byMethod.length > 0 && (
        <Panel title="Con qué se pagó">
          <Donut items={summary.byMethod} total={summary.total} label="Gasto por método de pago" />
        </Panel>
      )}

      <BudgetDialog
        open={budgetOpen}
        categories={categories}
        budgets={budgets}
        onClose={() => setBudgetOpen(false)}
        onSaved={() => {
          setBudgetOpen(false);
          void loadBudgets();
        }}
      />
    </>
  );
};

export default ResumenView;
