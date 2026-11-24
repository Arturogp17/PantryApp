import { beforeEach, describe, expect, test, vi } from "vitest";
import { pushDialogEntry, releaseDialogEntry } from "./useBackToClose";

// Historial simulado: la pruebas corren en node, sin navegador. back() es asíncrono como en el navegador
// y dispara popstate con el state de la entrada a la que se llega.
interface Entry {
  state: unknown;
  url: string;
}

const entries: Entry[] = [];
let index = 0;
const listeners: ((event: { state: unknown }) => void)[] = [];

const fakeWindow = {
  location: {
    get href() {
      return entries[index].url;
    },
  },
  history: {
    get state() {
      return entries[index].state;
    },
    pushState(state: unknown, _title: string, url: string) {
      entries.splice(index + 1);
      entries.push({ state, url });
      index = entries.length - 1;
    },
    back() {
      if (index === 0) return;
      index--;
      queueMicrotask(() => listeners.forEach((l) => l({ state: entries[index].state })));
    },
  },
  addEventListener(type: string, listener: (event: { state: unknown }) => void) {
    if (type === "popstate") listeners.push(listener);
  },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// El módulo registra su listener una sola vez, así que se usa el mismo window simulado en todas las pruebas.
beforeEach(() => {
  (globalThis as { window?: unknown }).window = fakeWindow;
  entries.length = 0;
  entries.push({ state: null, url: "/gastos?vista=movimientos" });
  index = 0;
});

describe("useBackToClose (pila de diálogos)", () => {
  test("abrir agrega una entrada con marcador y deja la misma URL", async () => {
    pushDialogEntry("a", () => {});
    expect(entries).toHaveLength(2);
    expect(index).toBe(1);
    expect(entries[1].url).toBe("/gastos?vista=movimientos");
    expect((entries[1].state as Record<string, unknown>).__dialogBack).toBe("a");
    releaseDialogEntry("a");
    await flush();
    expect(index).toBe(0);
  });

  test("regresar con el diálogo abierto lo cierra y no sale de la pantalla", async () => {
    const close = vi.fn();
    pushDialogEntry("a", close);
    fakeWindow.history.back();
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
    releaseDialogEntry("a");
    await flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
  });

  test("cerrar con el botón quita la entrada y no llama onClose", async () => {
    const close = vi.fn();
    pushDialogEntry("a", close);
    releaseDialogEntry("a");
    await flush();
    expect(close).not.toHaveBeenCalled();
    expect(index).toBe(0);
    expect(entries).toHaveLength(2);
  });

  test("con dos diálogos, regresar cierra primero el de arriba y luego el de abajo", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    pushDialogEntry("a", closeA);
    pushDialogEntry("b", closeB);
    fakeWindow.history.back();
    await flush();
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(index).toBe(1);
    fakeWindow.history.back();
    await flush();
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  test("cerrar el de arriba con el botón deja abierto el de abajo", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    pushDialogEntry("a", closeA);
    pushDialogEntry("b", closeB);
    releaseDialogEntry("b");
    await flush();
    expect(index).toBe(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();
    // Regresar ahora cierra el de abajo, que sigue en la pila.
    fakeWindow.history.back();
    await flush();
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(index).toBe(0);
  });

  test("cerrar el de abajo con el botón salta su entrada huérfana al regresar", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    pushDialogEntry("a", closeA);
    pushDialogEntry("b", closeB);
    releaseDialogEntry("a");
    await flush();
    expect(index).toBe(2);
    releaseDialogEntry("b");
    await flush();
    expect(index).toBe(0);
    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();
  });

  test("llamar release dos veces no vuelve a retroceder el historial", async () => {
    pushDialogEntry("a", () => {});
    releaseDialogEntry("a");
    releaseDialogEntry("a");
    await flush();
    expect(index).toBe(0);
  });
});
