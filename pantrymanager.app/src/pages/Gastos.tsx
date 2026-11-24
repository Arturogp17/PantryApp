import { useCallback, useEffect, useState } from "react";
import { Box, Chip, Fab, IconButton, Snackbar, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import api from "../api/client";
import { Card, Expense, ExpenseCategory, ExpenseSummary, IncomeSource, InstallmentPlan, PaidSinceCutoff, RecurringCharge, StatementSummary } from "../types";
import { errorMessage } from "../lib/errors";
import { monthKey, monthLong, shiftMonth } from "../lib/expenses";
import ResumenView from "../components/gastos/ResumenView";
import MovimientosView from "../components/gastos/MovimientosView";
import TarjetasView from "../components/gastos/TarjetasView";
import InstallmentsView from "../components/gastos/InstallmentsView";
import RecurringView from "../components/gastos/RecurringView";
import PlanView from "../components/gastos/PlanView";
import HealthView from "../components/gastos/HealthView";
import PaymentDialog from "../components/gastos/PaymentDialog";
import ExpenseDialog from "../components/gastos/ExpenseDialog";
import CardDialog from "../components/gastos/CardDialog";
import CategoriesDialog from "../components/gastos/CategoriesDialog";
import InstallmentDialog from "../components/gastos/InstallmentDialog";
import RecurringDialog from "../components/gastos/RecurringDialog";
import StatementImportDialog from "../components/gastos/StatementImportDialog";

type View = "resumen" | "movimientos" | "tarjetas" | "meses" | "recurrentes" | "plan" | "salud";

const VIEWS: { id: View; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "movimientos", label: "Movimientos" },
  { id: "tarjetas", label: "Tarjetas" },
  { id: "meses", label: "A meses" },
  { id: "recurrentes", label: "Recurrentes" },
  { id: "plan", label: "Plan" },
  { id: "salud", label: "Salud" },
];

const Gastos = () => {
  const currentKey = monthKey(new Date());
  const [view, setView] = useState<View>("resumen");
  const [month, setMonth] = useState(currentKey);
  const [cards, setCards] = useState<Card[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [statements, setStatements] = useState<StatementSummary[]>([]);
  const [paidSinceCutoff, setPaidSinceCutoff] = useState<PaidSinceCutoff[]>([]);
  const [incomes, setIncomes] = useState<IncomeSource[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState<InstallmentPlan | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringCharge | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const loadStatements = useCallback(async () => {
    try {
      setStatements((await api.get<StatementSummary[]>("/statements/latest")).data);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los estados de cuenta"));
    }
  }, []);

  const loadPaidSinceCutoff = useCallback(async () => {
    try {
      setPaidSinceCutoff((await api.get<PaidSinceCutoff[]>("/card-payments/since-cutoff")).data);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los pagos a tarjetas"));
    }
  }, []);

  const loadIncomes = useCallback(async () => {
    try {
      setIncomes((await api.get<IncomeSource[]>("/income")).data);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los ingresos"));
    }
  }, []);

  const loadCards = useCallback(async () => {
    try {
      setCards((await api.get<Card[]>("/cards")).data);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar las tarjetas"));
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setCategories((await api.get<ExpenseCategory[]>("/expense-categories")).data);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar las categorías"));
    }
  }, []);

  useEffect(() => {
    loadCards();
    loadCategories();
    loadStatements();
    loadPaidSinceCutoff();
    loadIncomes();
  }, [loadCards, loadCategories, loadStatements, loadPaidSinceCutoff, loadIncomes]);

  // Los gastos y pagos guardados sin conexión aparecen cuando se suben; se recarga todo al terminar el envío.
  useEffect(() => {
    const onSynced = () => {
      setVersion((v) => v + 1);
      loadCards();
      loadCategories();
      loadStatements();
      loadPaidSinceCutoff();
      loadIncomes();
    };
    window.addEventListener("outbox-synced", onSynced);
    return () => window.removeEventListener("outbox-synced", onSynced);
  }, [loadCards, loadCategories, loadStatements, loadPaidSinceCutoff, loadIncomes]);

  // El resumen se vuelve a pedir al cambiar de mes o al guardar un gasto.
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    api
      .get<ExpenseSummary>("/expenses/summary", { params: { month } })
      .then((r) => {
        if (!cancelled) {
          setSummary(r.data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "No se pudo cargar el resumen"));
      });
    return () => {
      cancelled = true;
    };
  }, [month, version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    loadStatements();
    loadPaidSinceCutoff();
    loadIncomes();
  };

  const openNew = () => {
    setEditingExpense(null);
    setExpenseOpen(true);
  };

  return (
    <Box sx={{ position: "relative", zIndex: 1, maxWidth: 520, mx: "auto", px: 2, pt: 2, pb: 12 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography component="h1" variant="h4" sx={{ lineHeight: 1.1 }}>
          Gastos
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <IconButton aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 800, minWidth: 96, textAlign: "center", fontSize: 15 }}>
            {monthLong(month).replace(/^./, (c) => c.toUpperCase())}
          </Typography>
          <IconButton aria-label="Mes siguiente" disabled={month >= currentKey} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {VIEWS.map((v) => (
          <Chip
            key={v.id}
            label={v.label}
            clickable
            color={view === v.id ? "primary" : "default"}
            variant={view === v.id ? "filled" : "outlined"}
            onClick={() => setView(v.id)}
            sx={{ height: 44, borderRadius: 22, fontWeight: 700 }}
          />
        ))}
      </Box>

      {error && <Typography sx={{ color: "error.main", mb: 2 }}>{error}</Typography>}

      {view === "resumen" && <ResumenView summary={summary} categories={categories} cards={cards} currentKey={currentKey} />}
      {view === "movimientos" && (
        <MovimientosView
          month={month}
          cards={cards}
          categories={categories}
          version={version}
          onEdit={(e) => {
            setEditingExpense(e);
            setExpenseOpen(true);
          }}
        />
      )}
      {view === "tarjetas" && (
        <TarjetasView
          cards={cards}
          summary={summary}
          statements={statements}
          paidSinceCutoff={paidSinceCutoff}
          incomes={incomes}
          onPay={() => setPaymentOpen(true)}
          onImport={() => setStatementOpen(true)}
          onAdd={() => {
            setEditingCard(null);
            setCardOpen(true);
          }}
          onEdit={(c) => {
            setEditingCard(c);
            setCardOpen(true);
          }}
          onCategories={() => setCategoriesOpen(true)}
        />
      )}
      {view === "meses" && (
        <InstallmentsView
          version={version}
          onAdd={() => {
            setEditingInstallment(null);
            setInstallmentOpen(true);
          }}
          onEdit={(p) => {
            setEditingInstallment(p);
            setInstallmentOpen(true);
          }}
        />
      )}
      {view === "recurrentes" && (
        <RecurringView
          version={version}
          onAdd={() => {
            setEditingRecurring(null);
            setRecurringOpen(true);
          }}
          onEdit={(r) => {
            setEditingRecurring(r);
            setRecurringOpen(true);
          }}
        />
      )}

      {view === "plan" && <PlanView cards={cards} statements={statements} onChanged={refresh} onNotice={setNotice} />}
      {view === "salud" && <HealthView cards={cards} statements={statements} />}

      <Fab
        variant="extended"
        color="secondary"
        onClick={openNew}
        aria-label="Agregar gasto"
        sx={{
          position: "fixed",
          right: 16,
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          zIndex: 6,
          minHeight: 56,
          fontWeight: 800,
          textTransform: "none",
        }}
      >
        <AddIcon sx={{ mr: 1 }} />
        Agregar gasto
      </Fab>

      <ExpenseDialog
        open={expenseOpen}
        expense={editingExpense}
        cards={cards}
        categories={categories}
        onClose={() => setExpenseOpen(false)}
        onSaved={(notice) => {
          setExpenseOpen(false);
          if (notice) setNotice(notice);
          refresh();
        }}
      />
      <CardDialog
        open={cardOpen}
        card={editingCard}
        onClose={() => setCardOpen(false)}
        onSaved={() => {
          setCardOpen(false);
          loadCards();
          refresh();
        }}
      />
      <InstallmentDialog
        open={installmentOpen}
        plan={editingInstallment}
        cards={cards}
        categories={categories}
        onClose={() => setInstallmentOpen(false)}
        onSaved={() => {
          setInstallmentOpen(false);
          refresh();
        }}
      />
      <RecurringDialog
        open={recurringOpen}
        item={editingRecurring}
        cards={cards}
        categories={categories}
        onClose={() => setRecurringOpen(false)}
        onSaved={() => {
          setRecurringOpen(false);
          refresh();
        }}
      />
      <StatementImportDialog
        open={statementOpen}
        cards={cards}
        categories={categories}
        onClose={() => setStatementOpen(false)}
        onImported={() => {
          loadCards();
          refresh();
        }}
      />
      <PaymentDialog
        open={paymentOpen}
        cards={cards}
        onClose={() => setPaymentOpen(false)}
        onSaved={(paymentNotice) => {
          setPaymentOpen(false);
          if (paymentNotice) setNotice(paymentNotice);
          refresh();
        }}
        onDeleted={refresh}
      />
      <CategoriesDialog
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={() => {
          loadCategories();
          refresh();
        }}
      />

      <Snackbar
        open={notice !== ""}
        autoHideDuration={4000}
        onClose={() => setNotice("")}
        message={notice}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: 12 }}
      />
    </Box>
  );
};

export default Gastos;
