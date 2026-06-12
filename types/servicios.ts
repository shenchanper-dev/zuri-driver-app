/**
 * ZURI Driver App — Shared service types
 */

// ── Servicio clásico (tabla servicios) ──────────────────────────────────────
export interface Servicio {
    id: number;
    codigo: string;
    estado: string;
    fuente: 'SERVICIO' | 'PROGRAMACION';
    tipoServicio: string;
    prioridad: string;
    fechaHora: string;
    tiempoEstimado: number | null;
    distanciaEstimada: number | null;
    // programacion fields
    doctor_nombre?: string;
    turno?: string;
    fecha?: string;
    hora_inicio?: string;
    hora_fin?: string;
    paciente: {
        nombre: string;
        telefono?: string;
        observaciones?: string;
    };
    origen: { direccion: string; latitud: number; longitud: number; referencia?: string };
    destino: { direccion: string; latitud: number; longitud: number; referencia?: string };
    clinica: { nombre: string; telefono?: string };
}

// ── Asignación directa de programacion_detalle (socket payload) ───────────
export interface AsignacionProgramacion {
    id: number;
    tipo: 'programacion_detalle';
    codigo: string;
    doctor: string;
    cliente: string;
    turno: string;
    horaInicio: string;
    horaFin: string;
    fecha: string;
    ubicacion: string;
    distrito: string;
    prioridad: string;
    tipoServicio?: string;
    tipoCreacion?: 'AUTOMATICO' | 'MANUAL';
}

export type TabType = 'pendientes' | 'activos' | 'historial';

// States
export const ESTADOS_PENDIENTE = ['ASIGNADO'] as const;
export const ESTADOS_ACTIVO = ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'] as const;
export const ESTADOS_HISTORIAL = ['COMPLETADO', 'CANCELADO', 'INCIDENTE'] as const;

// Acciones de avance (para programacion_detalle)
export type AccionProgresion = 'EN_CAMINO' | 'EN_ORIGEN' | 'EN_TRANSPORTE' | 'EN_DESTINO' | 'COMPLETAR';

export const ACCION_PROGRESION: Record<string, AccionProgresion> = {
    EN_CAMINO: 'EN_CAMINO',
    EN_ORIGEN: 'EN_ORIGEN',
    EN_TRANSPORTE: 'EN_TRANSPORTE',
    EN_DESTINO: 'EN_DESTINO',
    COMPLETADO: 'COMPLETAR',
};

// Palette Uber Health Driver
export const C = {
    fondo:       '#F0F4F8',
    header:      '#0B1F3A',
    card:        '#FFFFFF',
    verde:       '#00875A',
    azulTexto:   '#0B1F3A',
    grisTexto:   '#6B7280',
    borde:       '#E5E7EB',
    badgePending:'#FEF3C7',
    badgePendTx: '#92400E',
    muteText:    '#9CA3AF',
} as const;

// Badge config por estado
export const BADGE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    ASIGNADO:      { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente' },
    ACEPTADO:      { bg: '#DBEAFE', text: '#1D4ED8', label: 'Aceptado' },
    EN_CAMINO:     { bg: '#FEF3C7', text: '#92400E', label: 'En camino' },
    EN_ORIGEN:     { bg: '#D1FAE5', text: '#065F46', label: 'En origen' },
    EN_TRANSPORTE: { bg: '#EDE9FE', text: '#5B21B6', label: 'En transporte' },
    EN_DESTINO:    { bg: '#FCE7F3', text: '#9D174D', label: 'En destino' },
    COMPLETADO:    { bg: '#D1FAE5', text: '#065F46', label: 'Completado' },
    CANCELADO:     { bg: '#FEE2E2', text: '#DC2626', label: 'Cancelado' },
    INCIDENTE:     { bg: '#FEE2E2', text: '#DC2626', label: 'Incidente' },
};

// Color de acento izquierdo de tarjeta por estado
export const ACCENT_COLOR: Record<string, string> = {
    ASIGNADO:      '#F59E0B',
    ACEPTADO:      '#3B82F6',
    EN_CAMINO:     '#F97316',
    EN_ORIGEN:     '#10B981',
    EN_TRANSPORTE: '#8B5CF6',
    EN_DESTINO:    '#EC4899',
    COMPLETADO:    '#00875A',
    CANCELADO:     '#EF4444',
};

// Labels y config de botones de avance
export const AVANCE_CONFIG: Record<string, { label: string; accion: AccionProgresion; bg: string }> = {
    ACEPTADO:      { label: '🚗  EN CAMINO',            accion: 'EN_CAMINO',    bg: '#0B1F3A' },
    EN_CAMINO:     { label: '📍  LLEGADA',              accion: 'EN_ORIGEN',    bg: '#0B1F3A' },
    EN_ORIGEN:     { label: '👨‍⚕️  PROFESIONAL ABORDO', accion: 'EN_TRANSPORTE', bg: '#0B1F3A' },
    EN_TRANSPORTE: { label: '🏥  DEJANDO PROFESIONAL',  accion: 'EN_DESTINO',   bg: '#0B1F3A' },
    EN_DESTINO:    { label: '✅  TERMINO',              accion: 'COMPLETAR',    bg: '#00875A' },
};
