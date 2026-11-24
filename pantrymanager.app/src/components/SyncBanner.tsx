import { Alert, Box, Button } from "@mui/material";
import { discardFailures } from "../lib/outbox";
import type { OutboxSync } from "../hooks/useOutboxSync";

// Aviso fino de la cola sin conexión. Solo se muestra si hay cambios sin subir o fallidos.
const SyncBanner = ({ pending, failures, syncing, syncNow }: OutboxSync) => {
  if (pending === 0 && failures === 0) return null;

  return (
    <Box sx={{ display: "grid", gap: 1, px: 2, pt: 1 }}>
      {failures > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ py: 0 }}
          action={
            <Button color="inherit" size="small" onClick={() => discardFailures()}>
              Descartar
            </Button>
          }
        >
          {failures === 1 ? "1 cambio no se pudo subir." : `${failures} cambios no se pudieron subir.`}
        </Alert>
      )}
      {pending > 0 && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ py: 0 }}
          action={
            <Button color="inherit" size="small" disabled={syncing} onClick={() => void syncNow()}>
              Subir ahora
            </Button>
          }
        >
          {pending === 1
            ? "1 cambio sin subir. Se subirá solo cuando haya conexión."
            : `${pending} cambios sin subir. Se subirán solos cuando haya conexión.`}
        </Alert>
      )}
    </Box>
  );
};

export default SyncBanner;
