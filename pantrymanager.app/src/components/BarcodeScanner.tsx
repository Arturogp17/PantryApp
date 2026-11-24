import { useEffect, useRef, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { cameraSupported, startScanner, StopScanner } from "../lib/scanner";
import { isValidBarcode, normalizeBarcode } from "../lib/barcode";
import { useBackToClose } from "../hooks/useBackToClose";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

// Abre la cámara trasera y entrega el primer código de barras que lee.
// Si la cámara no está disponible (por ejemplo en HTTP) se puede escribir el código.
const BarcodeScanner = ({ open, onClose, onDetected }: BarcodeScannerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;

    handledRef.current = false;
    setError(null);
    setManual("");

    if (!cameraSupported()) {
      setError("La cámara no está disponible en este navegador o conexión. Escribe el código.");
      return;
    }

    let cancelled = false;
    let stop: StopScanner | null = null;

    // El diálogo monta el <video> después de abrirse.
    const timer = window.setTimeout(async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;

      try {
        const stopFn = await startScanner(video, (raw) => {
          if (handledRef.current) return;
          const code = normalizeBarcode(raw);
          if (!isValidBarcode(code)) return;
          handledRef.current = true;
          onDetectedRef.current(code);
        });

        if (cancelled) {
          stopFn();
        } else {
          stop = stopFn;
        }
      } catch {
        setError("No se pudo abrir la cámara. Revisa el permiso o escribe el código.");
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (stop) stop();
    };
  }, [open]);

  const submitManual = () => {
    const code = normalizeBarcode(manual);
    if (!isValidBarcode(code) || handledRef.current) return;
    handledRef.current = true;
    onDetected(code);
  };

  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Escanear código de barras</DialogTitle>
      <DialogContent>
        {error ? (
          <Typography sx={{ mb: 2, color: "error.main" }}>
            {error}
          </Typography>
        ) : (
          <Box sx={{ bgcolor: "#000", borderRadius: 2, overflow: "hidden", mb: 2 }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: "100%", maxHeight: "55vh", objectFit: "cover", display: "block" }}
            />
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            label="O escribe el código"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
          />
          <Button variant="contained" onClick={submitManual} disabled={!isValidBarcode(normalizeBarcode(manual))}>
            Usar
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
