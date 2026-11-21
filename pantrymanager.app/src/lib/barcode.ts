// Misma normalización que el backend (ProductResolver.NormalizeBarcode):
// solo dígitos y un UPC-A de 12 dígitos se guarda como EAN-13 con un cero al inicio.
export function normalizeBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 32) return null;

  return digits.length === 12 ? "0" + digits : digits;
}

export const isValidBarcode = (code: string | null): code is string =>
  code !== null && code.length >= 8;
