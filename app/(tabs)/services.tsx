/**
 * ZURI Driver App - Services Screen
 * List and manage assigned services
 */

import { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { showServiceAssignedNotification, requestNotificationPermissions } from '@/services/notifications';

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
    origen: {
        direccion: string;
        latitud: number;
        longitud: number;
    };
    destino: {
        direccion: string;
        latitud: number;
        longitud: number;
    };
    clinica: {
        nombre: string;
        telefono?: string;
    };
}

export default function ServicesScreen() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'all' | 'pendiente' | 'activo' | 'completado'>('all');

    // Load services
    const loadServices = useCallback(async () => {
        const response = await driverApi.getServices({
            estado: activeFilter === 'all' ? undefined : activeFilter
        });

        if (response.success) {
            setServices(response.servicios || []);
        }
        setIsLoading(false);
        setRefreshing(false);
    }, [activeFilter]);

    useEffect(() => {
        // Request notification permissions on mount
        requestNotificationPermissions();

        loadServices();

        // Listen for new service assignments
        socket.on('service:assigned', (data) => {
            console.log('📋 New service assigned:', data);

            // ZURI-FIX 2026-04-03: Vibración fuerte para alertar al conductor
            Vibration.vibrate([0, 500, 200, 500]);

            loadServices();
            // Show notification
            if (data.paciente?.nombre) {
                showServiceAssignedNotification({
                    codigo: data.codigo || 'Nuevo Servicio',
                    pacienteNombre: data.paciente.nombre,
                    origenDireccion: data.origen?.direccion || 'Ver detalles'
                });
            }
        });

        socket.on('service:updated', (data) => {
            console.log('📋 Service updated:', data);
            loadServices();
        });

        return () => {
            socket.off('service:assigned');
            socket.off('service:updated');
        };
    }, [loadServices]);

    // Accept service
    const handleAccept = async (service: Service) => {
        Alert.alert(
            'Aceptar Servicio',
            `¿Aceptar servicio para ${service.paciente.nombre}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Aceptar',
                    onPress: async () => {
                        const response = await driverApi.acceptService(service.id);
                        if (response.success) {
                            loadServices();
                        } else {
                            Alert.alert('Error', response.error || 'No se pudo aceptar');
                        }
                    },
                },
            ]
        );
    };

    // Reject service
    const handleReject = async (service: Service) => {
        const doReject = async (motivo: string) => {
            const response = await driverApi.rejectService(service.id, motivo);
            if (response.success) {
                loadServices();
            }
        };
        Alert.prompt(
            'Rechazar Servicio',
            'Motivo del rechazo (opcional):',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Rechazar',
                    style: 'destructive',
                    onPress: (motivo: string | undefined) => { doReject(motivo || ''); },
                },
            ]
        );
    };

    // Update service status
    const handleStatusUpdate = async (service: Service, nuevoEstado: string) => {
        const response = await driverApi.updateServiceStatus(service.id, nuevoEstado);
        if (response.success) {
            loadServices();
        } else {
            Alert.alert('Error', response.error || 'No se pudo actualizar');
        }
    };

    // Get next action for service
    const getNextAction = (estado: string): { label: string; estado: string; icon: string } | null => {
        const actions: Record<string, { label: string; estado: string; icon: string }> = {
            'ACEPTADO': { label: 'Iniciar Viaje', estado: 'EN_CAMINO', icon: 'navigate' },
            'EN_CAMINO': { label: 'Llegué al Origen', estado: 'EN_ORIGEN', icon: 'location' },
            'EN_ORIGEN': { label: 'Paciente Abordo', estado: 'EN_TRANSPORTE', icon: 'person-add' },
            'EN_TRANSPORTE': { label: 'Llegué al Destino', estado: 'EN_DESTINO', icon: 'flag' },
            'EN_DESTINO': { label: 'Completar', estado: 'COMPLETADO', icon: 'checkmark-circle' },
        };
        return actions[estado] || null;
    };

    // Get status color
    const getStatusColor = (estado: string): string => {
        const colors: Record<string, string> = {
            'ASIGNADO': '#F59E0B',
            'ACEPTADO': '#3B82F6',
            'EN_CAMINO': '#8B5CF6',
            'EN_ORIGEN': '#EC4899',
            'EN_TRANSPORTE': '#0066CC',
            'EN_DESTINO': '#10B981',
            'COMPLETADO': '#059669',
            'CANCELADO': '#EF4444',
        };
        return colors[estado] || '#666';
    };

    // Render service card
    const renderService = ({ item }: { item: Service }) => {
        const nextAction = getNextAction(item.estado);
        const isAssigned = item.estado === 'ASIGNADO';

        return (
            <View style={styles.serviceCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.estado) }]}>
                        <Text style={styles.statusText}>{item.estado.replace('_', ' ')}</Text>
                    </View>
                    <Text style={styles.serviceCode}>{item.codigo}</Text>
                </View>

                {/* Patient */}
                <View style={styles.patientRow}>
                    <Ionicons name="person" size={20} color="#333" />
                    <View style={styles.patientInfo}>
                        <Text style={styles.patientName}>{item.paciente.nombre}</Text>
                        {item.paciente.telefono && (
                            <Text style={styles.patientPhone}>{item.paciente.telefono}</Text>
                        )}
                    </View>
                </View>

                {/* Addresses */}
                <View style={styles.addressSection}>
                    <View style={styles.addressRow}>
                        <View style={styles.addressDot} />
                        <Text style={styles.addressText} numberOfLines={2}>
                            {item.origen.direccion}
                        </Text>
                    </View>
                    <View style={styles.addressLine} />
                    <View style={styles.addressRow}>
                        <View style={[styles.addressDot, styles.destinationDot]} />
                        <Text style={styles.addressText} numberOfLines={2}>
                            {item.destino.direccion}
                        </Text>
                    </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.metaText}>{item.tiempoEstimado || '--'} min</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="navigate-outline" size={16} color="#666" />
                        <Text style={styles.metaText}>{item.distanciaEstimada?.toFixed(1) || '--'} km</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="medical-outline" size={16} color="#666" />
                        <Text style={styles.metaText}>{item.clinica.nombre}</Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                    {isAssigned && (
                        <>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.rejectButton]}
                                onPress={() => handleReject(item)}
                            >
                                <Ionicons name="close" size={20} color="#EF4444" />
                                <Text style={styles.rejectText}>Rechazar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.acceptButton]}
                                onPress={() => handleAccept(item)}
                            >
                                <Ionicons name="checkmark" size={20} color="#fff" />
                                <Text style={styles.acceptText}>Aceptar</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {nextAction && (
                        <TouchableOpacity
                            style={[styles.actionButton, styles.primaryButton]}
                            onPress={() => handleStatusUpdate(item, nextAction.estado)}
                        >
                            <Ionicons name={nextAction.icon as any} size={20} color="#fff" />
                            <Text style={styles.primaryText}>{nextAction.label}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Filters */}
            <View style={styles.filters}>
                {(['all', 'pendiente', 'activo', 'completado'] as const).map((filter) => (
                    <TouchableOpacity
                        key={filter}
                        style={[styles.filterButton, activeFilter === filter && styles.filterActive]}
                        onPress={() => setActiveFilter(filter)}
                    >
                        <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                            {filter === 'all' ? 'Todos' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* List */}
            {isLoading ? (
                <ActivityIndicator size="large" color="#0066CC" style={styles.loader} />
            ) : (
                <FlatList
                    data={services}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderService}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => {
                            setRefreshing(true);
                            loadServices();
                        }} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="document-outline" size={64} color="#ccc" />
                            <Text style={styles.emptyText}>No hay servicios</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    filters: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        gap: 8,
    },
    filterButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
    },
    filterActive: {
        backgroundColor: '#0066CC',
    },
    filterText: {
        fontSize: 14,
        color: '#666',
    },
    filterTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
    loader: {
        marginTop: 40,
    },
    listContent: {
        padding: 16,
    },
    serviceCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    serviceCode: {
        fontSize: 12,
        color: '#888',
        fontFamily: 'monospace',
    },
    patientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    patientInfo: {
        flex: 1,
    },
    patientName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    patientPhone: {
        fontSize: 14,
        color: '#666',
    },
    addressSection: {
        marginBottom: 12,
        paddingLeft: 8,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    addressDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ccc',
        marginTop: 4,
    },
    destinationDot: {
        backgroundColor: '#0066CC',
    },
    addressLine: {
        width: 2,
        height: 20,
        backgroundColor: '#ddd',
        marginLeft: 5,
        marginVertical: 4,
    },
    addressText: {
        flex: 1,
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: 'row',
        gap: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        marginBottom: 12,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 13,
        color: '#666',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
    },
    rejectButton: {
        backgroundColor: '#FEE2E2',
    },
    rejectText: {
        color: '#EF4444',
        fontWeight: '600',
    },
    acceptButton: {
        backgroundColor: '#10B981',
    },
    acceptText: {
        color: '#fff',
        fontWeight: '600',
    },
    primaryButton: {
        backgroundColor: '#0066CC',
    },
    primaryText: {
        color: '#fff',
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#888',
        marginTop: 16,
    },
});
