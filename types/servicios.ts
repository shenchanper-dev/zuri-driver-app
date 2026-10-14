/**
 * ZURI Driver App — Shared service types
 */

// ── Servicio clásico (tabla servicios) ──────────────────────────────────────
export interface JornadaInfo {
    id: number;
    doctor_nombre: string | null;
    turno: string | null;
    cliente_nombre: string | null;
    estado: 'PUBLICADA' | 'ACTIVA' | string;
    modo?: 'ESPECIAL' | 'NEMT';
    total_paradas: number;
    atendidas: number;
    hora_inicio_planeada: string | null;
    hora_fin_planeada: string | null;
    // FASE E — inicio/fin hibrido + paradas detectadas por GPS
    inicio_real_at?: string | null;
    fin_real_at?: string | null;
    paradas_declaradas?: number | null;
    paradas_detectadas?: number;
    sugerencia_inicio_at?: string | null;
}

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
    orden?: number | null;
    jornada?: JornadaInfo;
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
export const ESTADOS_PENDIENTE = ['PENDIENTE'] as const;
export const ESTADOS_ACTIVO = ['EN_RUTA_ORIGEN', 'EN_ORIGEN', 'EN_RUTA_DESTINO', 'EN_DESTINO'] as const;
export const ESTADOS_HISTORIAL = ['ATENDIDA', 'DESCARTADA', 'ABORTADA', 'AUSENTE'] as const;

// Acciones de avance (para programacion_detalle)
export type AccionProgresion = 'EN_CAMINO' | 'EN_ORIGEN' | 'EN_TRANSPORTE' | 'EN_DESTINO' | 'COMPLETAR';

export const ACCION_PROGRESION: Record<string, AccionProgresion> = {
    PENDIENTE: 'EN_CAMINO',
    EN_RUTA_ORIGEN: 'EN_ORIGEN',
    EN_ORIGEN: 'EN_TRANSPORTE',
    EN_RUTA_DESTINO: 'EN_DESTINO',
    EN_DESTINO: 'COMPLETAR',
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
    PENDIENTE:       { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente' },
    EN_RUTA_ORIGEN:  { bg: '#FEF3C7', text: '#92400E', label: 'En camino' },
    EN_ORIGEN:       { bg: '#D1FAE5', text: '#065F46', label: 'En origen' },
    EN_RUTA_DESTINO: { bg: '#EDE9FE', text: '#5B21B6', label: 'En transporte' },
    EN_DESTINO:      { bg: '#FCE7F3', text: '#9D174D', label: 'En destino' },
    ATENDIDA:        { bg: '#D1FAE5', text: '#065F46', label: 'Atendida' },
    DESCARTADA:      { bg: '#FEE2E2', text: '#DC2626', label: 'Descartada' },
    ABORTADA:        { bg: '#FEE2E2', text: '#DC2626', label: 'Abortada' },
    AUSENTE:         { bg: '#FEF3C7', text: '#92400E', label: 'Ausente' },
};

// Color de acento izquierdo de tarjeta por estado
export const ACCENT_COLOR: Record<string, string> = {
    PENDIENTE:       '#F59E0B',
    EN_RUTA_ORIGEN:  '#F97316',
    EN_ORIGEN:       '#10B981',
    EN_RUTA_DESTINO: '#8B5CF6',
    EN_DESTINO:      '#EC4899',
    ATENDIDA:        '#00875A',
    DESCARTADA:      '#EF4444',
    ABORTADA:        '#DC2626',
    AUSENTE:         '#F59E0B',
};

// Labels y config de botones de avance
export const AVANCE_CONFIG: Record<string, { label: string; accion: AccionProgresion; bg: string }> = {
    PENDIENTE:       { label: '🚗  INICIAR RUTA',          accion: 'EN_CAMINO',    bg: '#0B1F3A' },
    EN_RUTA_ORIGEN:  { label: '📍  LLEGUE AL ORIGEN',      accion: 'EN_ORIGEN',    bg: '#0B1F3A' },
    EN_ORIGEN:       { label: '👨‍⚕️  EN CAMINO AL DESTINO', accion: 'EN_TRANSPORTE', bg: '#0B1F3A' },
    EN_RUTA_DESTINO: { label: '🏥  LLEGUE AL DESTINO',     accion: 'EN_DESTINO',   bg: '#0B1F3A' },
    EN_DESTINO:      { label: '✅  COMPLETAR',             accion: 'COMPLETAR',    bg: '#00875A' },
};
