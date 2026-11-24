import { Box, Button, Chip, TextField, Typography } from "@mui/material";
import { Card } from "../../types";
import { formatMoney } from "../../lib/money";
import { SplitPart } from "../../lib/split";
import { Dot } from "./charts";

// Partes máximas de un pago dividido, contando la de "lo que falte".
export const MAX_SPLIT_PARTS = 5;

// Una fila del pago: método (null es efectivo) y el monto escrito. La última fila es "lo que falte".
export interface SplitRow {
  cardId: number | null;
  amount: string;
}

// Monto de un campo de texto. Vacío o no numérico cuenta como 0, y resolveSplit lo marca como error.
export const toAmount = (text: string): number => {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
};

// Filas a partes para resolveSplit. La última no lleva monto: recibe lo que falte.
export const rowsToParts = (rows: SplitRow[]): SplitPart[] =>
  rows.map((row, i) => ({
    cardId: row.cardId,
    amount: i === rows.length - 1 ? null : toAmount(row.amount),
  }));

// Primer método (null es efectivo) que todavía no está en ninguna fila.
const nextMethod = (rows: SplitRow[], methods: Card[]): number | null => {
  const used = new Set<number | null>(rows.map((row) => row.cardId));
  const candidates: (number | null)[] = [null, ...methods.map((c) => c.id)];
  return candidates.find((id) => !used.has(id)) ?? null;
};

// Pasa de un solo método a dividir: la primera fila conserva el método y la segunda toma otro.
export const startSplit = (rows: SplitRow[], methods: Card[]): SplitRow[] => {
  const first: SplitRow = { cardId: rows[0].cardId, amount: "" };
  return [first, { cardId: nextMethod([first], methods), amount: "" }];
};

// Vuelve a un solo método, con el de la primera fila.
export const endSplit = (rows: SplitRow[]): SplitRow[] => [{ cardId: rows[0].cardId, amount: "" }];

// Agrega una fila justo antes de la de "lo que falte".
export const addSplitRow = (rows: SplitRow[], methods: Card[]): SplitRow[] => [
  ...rows.slice(0, -1),
  { cardId: nextMethod(rows, methods), amount: "" },
  rows[rows.length - 1],
];

interface Props {
  split: boolean;
  allowSplit: boolean;
  title: string;
  rows: SplitRow[];
  methods: Card[];
  labelOf: (card: Card) => string;
  total: number;
  freeAmount: number;
  error: string | null;
  // Filas ya guardadas: no se cambian, y con alguna guardada no se puede dividir de nuevo.
  locked?: boolean[];
  onToggle: () => void;
  onAdd: () => void;
  onCardChange: (index: number, cardId: number | null) => void;
  onAmountChange: (index: number, amount: string) => void;
}

export const PaymentSplit = ({
  split,
  allowSplit,
  title,
  rows,
  methods,
  labelOf,
  total,
  freeAmount,
  error,
  locked,
  onToggle,
  onAdd,
  onCardChange,
  onAmountChange,
}: Props) => {
  const frozen = locked?.some(Boolean) ?? false;

  const methodChips = (index: number) => {
    const selected = rows[index].cardId;
    const disabled = locked?.[index] ?? false;
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Chip
          label="Efectivo"
          clickable
          disabled={disabled}
          color={selected === null ? "primary" : "default"}
          variant={selected === null ? "filled" : "outlined"}
          icon={<Dot color="#E0B13D" size={10} />}
          onClick={() => onCardChange(index, null)}
          sx={{ height: 44 }}
        />
        {methods.map((c) => (
          <Chip
            key={c.id}
            label={labelOf(c)}
            clickable
            disabled={disabled}
            color={selected === c.id ? "primary" : "default"}
            variant={selected === c.id ? "filled" : "outlined"}
            icon={<Dot color={c.color} size={10} />}
            onClick={() => onCardChange(index, c.id)}
            sx={{ height: 44 }}
          />
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {split ? (
        rows.map((row, i) => {
          const last = i === rows.length - 1;
          return (
            <Box key={i}>
              <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>{last ? "Lo que falte" : `Pago ${i + 1}`}</Typography>
              {methodChips(i)}
              <TextField
                label="Monto"
                fullWidth
                value={last ? formatMoney(freeAmount) : row.amount}
                disabled={last || (locked?.[i] ?? false)}
                onChange={(e) => onAmountChange(i, e.target.value)}
                slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `Monto del pago ${i + 1}` } }}
                sx={{ mt: 1 }}
              />
            </Box>
          );
        })
      ) : (
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>{title}</Typography>
          {methodChips(0)}
        </Box>
      )}

      {split && (
        <Typography variant="body2" sx={{ color: error ? "error.main" : "text.secondary" }}>
          {error ?? `Cuadra con el total ${formatMoney(total)}`}
        </Typography>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {allowSplit && (
          <Button size="small" onClick={onToggle} disabled={frozen}>
            {split ? "Un solo método" : "Dividir pago"}
          </Button>
        )}
        {split && (
          <Button size="small" onClick={onAdd} disabled={frozen || rows.length >= MAX_SPLIT_PARTS}>
            Agregar método
          </Button>
        )}
      </Box>
    </Box>
  );
};
