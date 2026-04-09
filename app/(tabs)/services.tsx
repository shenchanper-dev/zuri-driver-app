/**
 * ZURI Driver App - Services Screen
 * Flujo completo bidireccional: asignación → aceptar/rechazar → estados del viaje
 * Para APK nativo Android (EAS Build)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Vibration,
    Modal,
    ScrollView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { showServiceAssignedNotification, requestNotificationPermissions } from '@/services/notifications';

// ============================================================================
// TIPOS
// ============================================================================

interface Service {
    id: number;
    codigo: string;
    estado: string;
    tipoServicio: string;
    prioridad: string;
    fechaHora: string;
    tiempoEstimado: number;
    distanciaEstimada: number;
    paciente: {
        nombre: string;
        telefono?: string;
        observaciones?: string;
    };
    origen: { direccion: string; latitud: number; longitud: number };
    destino: { direccion: string; latitud: number; longitud: number };
    clinica: { nombre: string; telefono?: string };
    timestamps?: {
        asignado?: string;
        aceptado?: string;
        iniciado?: string;
        finalizado?: string;
    };
}

// Asignación de programacion_detalle (diferente estructura)
interface ProgramacionAsignada {
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
}

type TabType = 'pendientes' | 'activos' | 'historial';

// ============================================================================
// CONSTANTES
// ============================================================================

const COUNTDOWN_SEGUNDOS = 30;

const ESTADOS_PENDIENTE = ['ASIGNADO'];
const ESTADOS_ACTIVO = ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'];
const ESTADOS_HISTORIAL = ['COMPLETADO', 'CANCELADO', 'INCIDENTE'];

const ESTADO_LABEL: Record<string, string> = {
    ASIGNADO: '🔔 Pendiente',
    ACEPTADO: '✅ Aceptado',
    EN_CAMINO: '🚗 En camino',
    EN_ORIGEN: '📍 En origen',
    EN_TRANSPORTE: '👨‍⚕️ Paciente abordo',
    EN_DESTINO: '🏁 En destino',
    COMPLETADO: '✅ Completado',
    CANCELADO: '❌ Cancelado',
    INCIDENTE: '⚠️ Incidente',
};

const ESTADO_COLOR: Record<string, string> = {
    ASIGNADO: '#F59E0B',
    ACEPTADO: '#3B82F6',
    EN_CAMINO: '#8B5CF6',
    EN_ORIGEN: '#EC4899',
    EN_TRANSPORTE: '#0066CC',
    EN_DESTINO: '#10B981',
    COMPLETADO: '#059669',
    CANCELADO: '#EF4444',
    INCIDENTE: '#DC2626',
};

const SIGUIENTE_ESTADO: Record<string, { label: string; estado: string; icon: string }> = {
    ACEPTADO:     { label: 'Iniciar viaje',        estado: 'EN_CAMINO',    icon: 'navigate' },
    EN_CAMINO:    { label: 'Llegué al origen',      estado: 'EN_ORIGEN',    icon: 'location' },
    EN_ORIGEN:    { label: 'Paciente abordo',       estado: 'EN_TRANSPORTE', icon: 'person-add' },
    EN_TRANSPORTE:{ label: 'Llegué al destino',     estado: 'EN_DESTINO',   icon: 'flag' },
    EN_DESTINO:   { label: 'Completar servicio',    estado: 'COMPLETADO',   icon: 'checkmark-circle' },
};

const PASOS_VIAJE = [
    { estado: 'ACEPTADO',      label: 'Aceptado' },
    { estado: 'EN_CAMINO',     label: 'En camino' },
    { estado: 'EN_ORIGEN',     label: 'En origen' },
    { estado: 'EN_TRANSPORTE', label: 'Abordo' },
    { estado: 'EN_DESTINO',    label: 'En destino' },
    { estado: 'COMPLETADO',    label: 'Completado' },
];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function ServicesScreen() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('pendientes');

    // Notificación de nueva asignación (programacion_detalle)
    const [nuevaAsignacion, setNuevaAsignacion] = useState<ProgramacionAsignada | null>(null);
    const [countdown, setCountdown] = useState(COUNTDOWN_SEGUNDOS);
    const [rechazoModalVisible, setRechazoModalVisible] = useState(false);
    const [motivoRechazo, setMotivoRechazo] = useState('');
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Cargar servicios ────────────────────────────────────────────────────
    const loadServices = useCallback(async () => {
        try {
            const response = await driverApi.getServices({ estado: 'all' });
            if (response.success) {
                setServices(response.servicios || []);
            }
        } catch (e) {
            console.error('[Services] loadServices error:', e);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    // ── Countdown para nueva asignación ────────────────────────────────────
    const iniciarCountdown = useCallback(() => {
        setCountdown(COUNTDOWN_SEGUNDOS);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    // Auto-rechazar si no responde
                    setNuevaAsignacion(na => {
                        if (na) {
                            driverApi.responderProgramacion(na.id, 'RECHAZAR', 'Sin respuesta (timeout)').catch(() => {});
                        }
                        return null;
                    });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const limpiarCountdown = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }, []);

    // ── Socket events ───────────────────────────────────────────────────────
    useEffect(() => {
        requestNotificationPermissions();
        loadServices();

        socket.on('service:assigned', (data: any) => {
            console.log('📋 [Socket] service:assigned:', data);
            Vibration.vibrate([0, 500, 200, 500, 200, 500]);

            // Si viene de programacion_detalle
            if (data.tipo === 'programacion_detalle') {
                setNuevaAsignacion(data as ProgramacionAsignada);
                setActiveTab('pendientes');
                iniciarCountdown();
            } else {
                // Servicio clásico (tabla servicios)
                loadServices();
                if (data.paciente?.nombre) {
                    showServiceAssignedNotification({
                        codigo: data.codigo || 'Nuevo Servicio',
                        pacienteNombre: data.paciente.nombre,
                        origenDireccion: data.origen?.direccion || 'Ver detalles',
                    });
                }
            }
        });

        socket.on('service:updated', () => {
            loadServices();
        });

        return () => {
            socket.off('service:assigned');
            socket.off('service:updated');
            limpiarCountdown();
        };
    }, [loadServices, iniciarCountdown, limpiarCountdown]);

    // ── Filtros por tab ─────────────────────────────────────────────────────
    const serviciosFiltrados = services.filter(s => {
        if (activeTab === 'pendientes') return ESTADOS_PENDIENTE.includes(s.estado);
        if (activeTab === 'activos')   return ESTADOS_ACTIVO.includes(s.estado);
        return ESTADOS_HISTORIAL.includes(s.estado);
    });

    const countPendientes = services.filter(s => ESTADOS_PENDIENTE.includes(s.estado)).length
        + (nuevaAsignacion ? 1 : 0);
    const countActivos = services.filter(s => ESTADOS_ACTIVO.includes(s.estado)).length;

    // ── Acciones servicios clásicos ─────────────────────────────────────────
    const handleAceptar = async (service: Service) => {
        Alert.alert(
            'Aceptar Servicio',
            `¿Aceptar servicio para ${service.paciente.nombre}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Aceptar ✅',
                    onPress: async () => {
                        const res = await driverApi.acceptService(service.id);
                        if (res.success) {
                            loadServices();
                            setActiveTab('activos');
                        } else {
                            Alert.alert('Error', res.error || 'No se pudo aceptar');
                        }
                    },
                },
            ]
        );
    };

    const handleRechazar = (service: Service) => {
        Alert.alert(
            'Rechazar Servicio',
            'Selecciona el motivo:',
            [
                { text: 'Fuera de zona',    onPress: () => doRechazar(service, 'Fuera de zona') },
                { text: 'Vehículo con falla', onPress: () => doRechazar(service, 'Vehículo con falla') },
                { text: 'Otro motivo',      onPress: () => doRechazar(service, 'Otro') },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    const doRechazar = async (service: Service, motivo: string) => {
        const res = await driverApi.rejectService(service.id, motivo);
        if (res.success) {
            loadServices();
        } else {
            Alert.alert('Error', res.error || 'No se pudo rechazar');
        }
    };

    const handleAvanzarEstado = async (service: Service) => {
        const siguiente = SIGUIENTE_ESTADO[service.estado];
        if (!siguiente) return;

        Alert.alert(
            siguiente.label,
            `¿Confirmar: "${siguiente.label}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: async () => {
                        const res = await driverApi.updateServiceStatus(service.id, siguiente.estado);
                        if (res.success) {
                            loadServices();
                            if (siguiente.estado === 'COMPLETADO') setActiveTab('historial');
                        } else {
                            Alert.alert('Error', res.error || 'No se pudo actualizar');
                        }
                    },
                },
            ]
        );
    };

    // ── Acciones programacion_detalle ───────────────────────────────────────
    const handleAceptarProgramacion = async () => {
        if (!nuevaAsignacion) return;
        limpiarCountdown();
        const res = await driverApi.responderProgramacion(nuevaAsignacion.id, 'ACEPTAR');
        if (res.success) {
            Alert.alert('✅ Aceptado', `Servicio aceptado: ${nuevaAsignacion.doctor}`);
            setNuevaAsignacion(null);
            loadServices();
        } else {
            Alert.alert('Error', res.error || 'No se pudo aceptar');
        }
    };

    const handleRechazarProgramacion = (motivo: string) => {
        if (!nuevaAsignacion) return;
        limpiarCountdown();
        driverApi.responderProgramacion(nuevaAsignacion.id, 'RECHAZAR', motivo)
            .then(res => {
                if (!res.success) Alert.alert('Error', res.error || 'Error al rechazar');
            })
            .catch(() => {});
        setNuevaAsignacion(null);
        setRechazoModalVisible(false);
    };

    // ── Render: modal de nueva asignación (programacion_detalle) ───────────
    const renderNuevaAsignacion = () => {
        if (!nuevaAsignacion) return null;
        const segundos = String(countdown % 60).padStart(2, '0');
        const minutos = String(Math.floor(countdown / 60)).padStart(2, '0');
        const urgente = countdown <= 10;

        return (
            <Modal visible transparent animationType="slide" statusBarTranslucent>
                <View style={styles.modalOverlay}>
                    <View style={styles.asignacionCard}>
                        {/* Header */}
                        <View style={styles.asignacionHeader}>
                            <Text style={styles.asignacionTitleLabel}>🔔 NUEVO SERVICIO ASIGNADO</Text>
                        </View>

                        {/* Info */}
                        <View style={styles.asignacionBody}>
                            <InfoRow icon="person" text={`Dr. ${nuevaAsignacion.doctor}`} bold />
                            <InfoRow icon="business" text={nuevaAsignacion.cliente || '—'} />
                            {nuevaAsignacion.turno ? (
                                <InfoRow icon="time" text={`${nuevaAsignacion.turno}: ${nuevaAsignacion.horaInicio?.slice(0,5)} — ${nuevaAsignacion.horaFin?.slice(0,5)}`} />
                            ) : (
                                <InfoRow icon="time" text={`${nuevaAsignacion.horaInicio?.slice(0,5)} — ${nuevaAsignacion.horaFin?.slice(0,5)}`} />
                            )}
                            {nuevaAsignacion.distrito ? (
                                <InfoRow icon="location" text={nuevaAsignacion.distrito} />
                            ) : null}
                            {nuevaAsignacion.ubicacion ? (
                                <InfoRow icon="map" text={nuevaAsignacion.ubicacion} />
                            ) : null}
                            {nuevaAsignacion.codigo ? (
                                <InfoRow icon="document" text={nuevaAsignacion.codigo} />
                            ) : null}
                        </View>

                        {/* Countdown */}
                        <View style={[styles.countdownRow, urgente && styles.countdownUrgente]}>
                            <Ionicons name="timer-outline" size={18} color={urgente ? '#DC2626' : '#F59E0B'} />
                            <Text style={[styles.countdownText, urgente && styles.countdownUrgente]}>
                                {' '}Responder en: {minutos}:{segundos}
                            </Text>
                        </View>

                        {/* Botones */}
                        <View style={styles.asignacionBotones}>
                            <TouchableOpacity
                                style={[styles.btnAccion, styles.btnRechazar]}
                                onPress={() => setRechazoModalVisible(true)}
                            >
                                <Ionicons name="close-circle" size={20} color="#EF4444" />
                                <Text style={styles.btnRechazarText}>RECHAZAR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.btnAccion, styles.btnAceptar]}
                                onPress={handleAceptarProgramacion}
                            >
                                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                <Text style={styles.btnAceptarText}>ACEPTAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    // ── Render: modal motivo de rechazo ─────────────────────────────────────
    const renderModalRechazo = () => (
        <Modal visible={rechazoModalVisible} transparent animationType="fade" statusBarTranslucent>
            <View style={styles.modalOverlay}>
                <View style={styles.rechazoCard}>
                    <Text style={styles.rechazoTitle}>Motivo del rechazo</Text>
                    {['Fuera de zona', 'Vehículo con falla', 'Turno incompatible', 'Otro'].map(motivo => (
                        <TouchableOpacity
                            key={motivo}
                            style={styles.motivoBtn}
                            onPress={() => handleRechazarProgramacion(motivo)}
                        >
                            <Ionicons name="radio-button-off" size={18} color="#EF4444" />
                            <Text style={styles.motivoText}>{motivo}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={styles.motivoCancelar}
                        onPress={() => setRechazoModalVisible(false)}
                    >
                        <Text style={styles.motivoCancelarText}>Cancelar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    // ── Render: tarjeta de servicio clásico ────────────────────────────────
    const renderService = ({ item }: { item: Service }) => {
        const siguiente = SIGUIENTE_ESTADO[item.estado];
        const esPendiente = item.estado === 'ASIGNADO';
        const estadoActualIdx = PASOS_VIAJE.findIndex(p => p.estado === item.estado);

        return (
            <View style={styles.serviceCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: ESTADO_COLOR[item.estado] || '#666' }]}>
                        <Text style={styles.statusText}>{ESTADO_LABEL[item.estado] || item.estado}</Text>
                    </View>
                    <Text style={styles.serviceCode}>{item.codigo}</Text>
                </View>

                {/* Paciente */}
                <View style={styles.patientRow}>
                    <Ionicons name="person" size={20} color="#333" />
                    <View style={styles.patientInfo}>
                        <Text style={styles.patientName}>{item.paciente.nombre}</Text>
                        {item.paciente.telefono && (
                            <Text style={styles.patientPhone}>{item.paciente.telefono}</Text>
                        )}
                        {item.paciente.observaciones ? (
                            <Text style={styles.patientObs} numberOfLines={1}>
                                ⚠️ {item.paciente.observaciones}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {/* Direcciones */}
                <View style={styles.addressSection}>
                    <View style={styles.addressRow}>
                        <View style={styles.addressDot} />
                        <Text style={styles.addressText} numberOfLines={2}>{item.origen.direccion}</Text>
                    </View>
                    <View style={styles.addressLine} />
                    <View style={styles.addressRow}>
                        <View style={[styles.addressDot, styles.destinationDot]} />
                        <Text style={styles.addressText} numberOfLines={2}>{item.destino.direccion}</Text>
                    </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={15} color="#666" />
                        <Text style={styles.metaText}>{item.tiempoEstimado || '--'} min</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="navigate-outline" size={15} color="#666" />
                        <Text style={styles.metaText}>{item.distanciaEstimada?.toFixed(1) || '--'} km</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="medical-outline" size={15} color="#666" />
                        <Text style={styles.metaText} numberOfLines={1}>{item.clinica.nombre}</Text>
                    </View>
                </View>

                {/* Progreso del viaje (solo activos) */}
                {ESTADOS_ACTIVO.includes(item.estado) && (
                    <View style={styles.progresoContainer}>
                        {PASOS_VIAJE.map((paso, idx) => {
                            const completado = idx < estadoActualIdx;
                            const actual = idx === estadoActualIdx;
                            return (
                                <View key={paso.estado} style={styles.pasoRow}>
                                    <View style={[
                                        styles.pasoDot,
                                        completado && styles.pasoDotCompletado,
                                        actual && styles.pasoDotActual,
                                    ]}>
                                        {completado && <Ionicons name="checkmark" size={10} color="#fff" />}
                                    </View>
                                    <Text style={[
                                        styles.pasoLabel,
                                        actual && styles.pasoLabelActual,
                                        completado && styles.pasoLabelCompletado,
                                    ]}>
                                        {paso.label}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Acciones */}
                {esPendiente && (
                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={() => handleRechazar(item)}
                        >
                            <Ionicons name="close" size={18} color="#EF4444" />
                            <Text style={styles.rejectText}>Rechazar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.acceptButton]}
                            onPress={() => handleAceptar(item)}
                        >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.acceptText}>Aceptar</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {siguiente && !esPendiente && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton, { marginTop: 8 }]}
                        onPress={() => handleAvanzarEstado(item)}
                    >
                        <Ionicons name={siguiente.icon as any} size={18} color="#fff" />
                        <Text style={styles.primaryText}>{siguiente.label}</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // ── Render principal ─────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Tabs */}
            <View style={styles.tabs}>
                <TabBtn
                    label="📋 PENDIENTES"
                    badge={countPendientes}
                    active={activeTab === 'pendientes'}
                    onPress={() => setActiveTab('pendientes')}
                />
                <TabBtn
                    label="🚗 ACTIVOS"
                    badge={countActivos}
                    active={activeTab === 'activos'}
                    onPress={() => setActiveTab('activos')}
                />
                <TabBtn
                    label="✅ HISTORIAL"
                    active={activeTab === 'historial'}
                    onPress={() => setActiveTab('historial')}
                />
            </View>

            {/* Lista */}
            {isLoading ? (
                <ActivityIndicator size="large" color="#0066CC" style={styles.loader} />
            ) : (
                <FlatList
                    data={serviciosFiltrados}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderService}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadServices(); }}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="document-outline" size={64} color="#ccc" />
                            <Text style={styles.emptyText}>
                                {activeTab === 'pendientes' ? 'Sin servicios pendientes' :
                                 activeTab === 'activos' ? 'Sin servicios activos' :
                                 'Sin historial'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Modales */}
            {renderNuevaAsignacion()}
            {renderModalRechazo()}
        </View>
    );
}

// ── Componente auxiliar: botón de tab ──────────────────────────────────────
function TabBtn({ label, badge, active, onPress }: {
    label: string; badge?: number; active: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[styles.tab, active && styles.tabActive]}
            onPress={onPress}
        >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            {badge != null && badge > 0 && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

// ── Componente auxiliar: fila de info ──────────────────────────────────────
function InfoRow({ icon, text, bold }: { icon: string; text: string; bold?: boolean }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon as any} size={16} color="#475569" />
            <Text style={[styles.infoText, bold && styles.infoTextBold]} numberOfLines={2}>{text}</Text>
        </View>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f7fa' },

    // Tabs
    tabs: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        paddingHorizontal: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 4,
    },
    tabActive: { borderBottomWidth: 2, borderBottomColor: '#0066CC' },
    tabText: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textAlign: 'center' },
    tabTextActive: { color: '#0066CC' },
    badge: {
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    loader: { marginTop: 40 },
    listContent: { padding: 12, paddingBottom: 100 },

    // Service card
    serviceCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 3,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    serviceCode: { fontSize: 11, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

    patientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
    patientInfo: { flex: 1 },
    patientName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
    patientPhone: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    patientObs: { fontSize: 12, color: '#F59E0B', marginTop: 2 },

    addressSection: { marginBottom: 10, paddingLeft: 4 },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    addressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9ca3af', marginTop: 5 },
    destinationDot: { backgroundColor: '#0066CC' },
    addressLine: { width: 2, height: 18, backgroundColor: '#e5e7eb', marginLeft: 4, marginVertical: 2 },
    addressText: { flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 18 },

    metaRow: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginBottom: 10 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    metaText: { fontSize: 12, color: '#6b7280' },

    // Progreso del viaje
    progresoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'nowrap' },
    pasoRow: { alignItems: 'center', flex: 1 },
    pasoDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    pasoDotCompletado: { backgroundColor: '#10B981' },
    pasoDotActual: { backgroundColor: '#0066CC', borderWidth: 2, borderColor: '#93c5fd' },
    pasoLabel: { fontSize: 9, color: '#9ca3af', textAlign: 'center' },
    pasoLabelActual: { color: '#0066CC', fontWeight: '700' },
    pasoLabelCompletado: { color: '#10B981' },

    // Acciones
    actionsRow: { flexDirection: 'row', gap: 10 },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 11,
        borderRadius: 12,
    },
    rejectButton: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
    rejectText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
    acceptButton: { backgroundColor: '#10B981' },
    acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    primaryButton: { backgroundColor: '#0066CC' },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: 15, color: '#9ca3af', marginTop: 16 },

    // Modal overlay
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },

    // Nueva asignación card
    asignacionCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        paddingBottom: 32,
    },
    asignacionHeader: {
        backgroundColor: '#0066CC',
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    asignacionTitleLabel: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
    asignacionBody: { padding: 20, gap: 10 },
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginHorizontal: 20,
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginBottom: 16,
    },
    countdownUrgente: {
        backgroundColor: '#FEF2F2',
        borderColor: '#FECACA',
    },
    countdownText: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
    asignacionBotones: { flexDirection: 'row', gap: 14, paddingHorizontal: 20 },
    btnAccion: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    btnRechazar: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA' },
    btnRechazarText: { color: '#EF4444', fontWeight: '800', fontSize: 15 },
    btnAceptar: { backgroundColor: '#10B981' },
    btnAceptarText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Rechazo modal
    rechazoCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 36,
    },
    rechazoTitle: { fontSize: 17, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
    motivoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    motivoText: { fontSize: 15, color: '#374151' },
    motivoCancelar: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
    motivoCancelarText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },

    // Info rows (nueva asignación)
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    infoText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
    infoTextBold: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
});
