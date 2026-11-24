import { useEffect, useId, useRef } from "react";

// Clave propia dentro de history.state. react-router guarda usr, key e idx en ese mismo objeto,
// así que se conserva todo lo que ya trae y solo se agrega este marcador.
const MARK = "__dialogBack";

interface Entry {
  id: string;
  close: () => void;
}

// Pila de diálogos abiertos, del más antiguo al más reciente. Coincide con el orden de las entradas del historial.
const stack: Entry[] = [];

// Cuántos history.back() pidió este módulo al cerrar un diálogo con su botón. Su popstate no debe cerrar nada.
let ownBacks = 0;
let listening = false;

const browser = (): Window | null => (typeof window === "undefined" ? null : window);

const markOf = (state: unknown): string | undefined => {
  if (state === null || typeof state !== "object" || !(MARK in state)) return undefined;
  const value = (state as Record<string, unknown>)[MARK];
  return typeof value === "string" ? value : undefined;
};

const onPopState = (event: PopStateEvent): void => {
  const mark = markOf(event.state);
  // Un pop pedido por este módulo no cierra diálogos, pero sí puede caer en una entrada huérfana que hay que saltar.
  const ours = ownBacks > 0;
  if (ours) ownBacks--;
  const win = browser();
  const top = stack[stack.length - 1];

  // El usuario regresó desde el diálogo de arriba: se cierra ese diálogo y la pantalla se queda donde está.
  if (!ours && top && mark !== top.id) {
    stack.pop();
    top.close();
  }

  // Si la entrada a la que se llegó pertenece a un diálogo ya cerrado, se salta para no dejar una pantalla vacía.
  if (win && mark !== undefined && !stack.some((e) => e.id === mark)) {
    ownBacks++;
    win.history.back();
  }
};

export const pushDialogEntry = (id: string, close: () => void): void => {
  const win = browser();
  if (!win) return;
  if (!listening) {
    win.addEventListener("popstate", onPopState);
    listening = true;
  }
  stack.push({ id, close });
  const base: Record<string, unknown> = win.history.state !== null && typeof win.history.state === "object" ? win.history.state : {};
  win.history.pushState({ ...base, [MARK]: id }, "", win.location.href);
};

// Se llama cuando el diálogo se cierra. Si su entrada es la actual, se retira con history.back().
export const releaseDialogEntry = (id: string): void => {
  const index = stack.findIndex((e) => e.id === id);
  if (index === -1) return; // Ya se cerró con el botón atrás del sistema.
  stack.splice(index, 1);
  const win = browser();
  if (win && markOf(win.history.state) === id) {
    ownBacks++;
    win.history.back();
  }
};

// Diálogos de pantalla completa o principales: al abrirse agregan una entrada al historial, y el botón
// regresar del teléfono o del navegador los cierra en vez de salir de la pantalla.
export const useBackToClose = (open: boolean, onClose: () => void): void => {
  const id = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    pushDialogEntry(id, () => closeRef.current());
    return () => releaseDialogEntry(id);
  }, [open, id]);
};
