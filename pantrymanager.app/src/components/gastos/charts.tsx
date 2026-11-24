import { Box, Typography } from "@mui/material";
import { ChartMonth, ChartSeries, donutGradient, shortMoney } from "../../lib/expenses";
import { formatMoney } from "../../lib/money";

const Dot = ({ color, size = 12 }: { color: string; size?: number }) => (
  <Box aria-hidden="true" sx={{ flex: "0 0 auto", width: size, height: size, borderRadius: "50%", bgcolor: color }} />
);

export const Legend = ({ items }: { items: { name: string; color: string }[] }) => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", mt: 1.5 }}>
    {items.map((item) => (
      <Box key={item.name} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
        <Dot color={item.color} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {item.name}
        </Typography>
      </Box>
    ))}
  </Box>
);

const BAR_AREA = 140;

// Barras apiladas por mes. El mes en curso va con borde punteado porque todavía no termina.
export const StackedBars = ({
  months,
  series,
  currentKey,
}: {
  months: ChartMonth[];
  series: ChartSeries[];
  currentKey: string;
}) => {
  const max = Math.max(1, ...months.map((m) => m.total));
  const summary = months.map((m) => `${m.label}: ${formatMoney(m.total)}`).join(", ");

  return (
    <>
      <Box
        role="img"
        aria-label={`Gasto por mes. ${summary}`}
        sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 1, height: BAR_AREA + 44 }}
      >
        {months.map((m) => (
          <Box
            key={m.key}
            sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{shortMoney(m.total)}</Typography>
            <Box
              sx={{
                width: "min(34px, 100%)",
                height: Math.max(m.total > 0 ? 4 : 0, (m.total / max) * BAR_AREA),
                display: "flex",
                flexDirection: "column-reverse",
                borderRadius: "6px",
                overflow: "hidden",
                ...(m.key === currentKey ? { outline: "2px dashed", outlineColor: "text.secondary", outlineOffset: "2px", opacity: 0.85 } : {}),
              }}
            >
              {m.segments.map((s, i) => (
                <Box key={i} sx={{ height: `${(s.value / m.total) * 100}%`, bgcolor: s.color }} />
              ))}
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>{m.label}</Typography>
          </Box>
        ))}
      </Box>
      <Legend items={series} />
    </>
  );
};

// Dona con el total al centro y la leyenda al lado.
export const Donut = ({
  items,
  total,
  label,
}: {
  items: { name: string; color: string; total: number }[];
  total: number;
  label: string;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
    <Box
      role="img"
      aria-label={`${label}. ${items.map((i) => `${i.name}: ${formatMoney(i.total)}`).join(", ")}`}
      sx={{
        position: "relative",
        flex: "0 0 auto",
        width: 128,
        height: 128,
        borderRadius: "50%",
        background: donutGradient(items),
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: "26px",
          borderRadius: "50%",
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary" }}>Total</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{formatMoney(Math.round(total))}</Typography>
      </Box>
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {items.map((item) => (
        <Box key={item.name} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 1 }}>
          <Box sx={{ pt: "3px" }}>
            <Dot color={item.color} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, overflowWrap: "anywhere" }}>{item.name}</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {formatMoney(item.total)}
              {total > 0 ? ` · ${((item.total / total) * 100).toFixed(1)}%` : ""}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  </Box>
);

export { Dot };
