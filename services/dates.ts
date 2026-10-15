/**
 * Fecha/hora Lima (UTC-5) — helper unico para la app conductor.
 * Mismo contrato que el helper backend src/lib/dates.ts.
 */

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Fecha Lima en formato YYYY-MM-DD. */
export function fechaLima(fecha?: string): string {
    if (fecha) return fecha;
    return new Date(Date.now() - LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hora Lima en formato HH:MM. */
export function horaLima(): string {
    return new Date(Date.now() - LIMA_OFFSET_MS).toISOString().slice(11, 16);
}
