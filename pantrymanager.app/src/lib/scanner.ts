export type StopScanner = () => void;

interface DetectedBarcode {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

export const cameraSupported = (): boolean =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === "function";

// Lee códigos de barras con la cámara. Usa BarcodeDetector del navegador cuando existe
// (Chrome en Android) y, si no, la librería ZXing (iPhone y otros), que se descarga solo en ese caso.
// Devuelve una función que apaga la cámara. onCode puede dispararse varias veces con el mismo código.
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<StopScanner> {
  const Native = (window as unknown as {
    BarcodeDetector?: new (options?: { formats: string[] }) => NativeBarcodeDetector;
  }).BarcodeDetector;

  if (Native) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    let detector: NativeBarcodeDetector;
    try {
      detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    } catch {
      detector = new Native();
    }

    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        if (found.length > 0 && found[0].rawValue) {
          onCode(found[0].rawValue);
        }
      } catch {
        // Un cuadro sin código o un fallo puntual de lectura: se intenta en el siguiente.
      } finally {
        busy = false;
      }
    }, 250);

    return () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }

  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
    if (result) onCode(result.getText());
  });

  return () => controls.stop();
}
