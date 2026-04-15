import React, { useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { driverApi } from '@/services/api';
import type { AsignacionProgramacion } from '@/types/servicios';
import { C } from '@/types/servicios';

interface Props {
    visible: boolean;
    asignacion: AsignacionProgramacion | null;
    onAceptado: (asignacion: AsignacionProgramacion) => void;
}

function DetalleRow({ icon, texto, bold }: { icon: string; texto: string; bold?: boolean }) {
    return (
        <View style={s.detalleRow}>
            <Text style={s.detalleIcon}>{icon}</Text>
            <Text style={[s.detalleTexto, bold && s.detalleBold]} numberOfLines={2}>
                {texto}
            </Text>
        </View>
    );
}

export function ServicioModal({ visible, asignacion, onAceptado }: Props) {
    const [loading, setLoading] = useState(false);

    if (!asignacion) return null;

    const turnoLabel = asignacion.turno
        ? `Turno ${asignacion.turno}`
        : 'Sin turno';
    const horaStr = `${asignacion.horaInicio?.slice(0, 5) ?? ''} — ${asignacion.horaFin?.slice(0, 5) ?? ''}`;

    const handleAceptar = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await driverApi.responderProgramacion(asignacion.id, 'ACEPTAR');
            if (res.success) {
                onAceptado(asignacion);
            } else {
                Alert.alert('Error', res.error || 'No se pudo aceptar. Intenta nuevamente.');
            }
        } catch {
            Alert.alert('Sin conexión', 'Verifica tu internet e intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    {/* Handle bar */}
                    <View style={s.handle} />

                    {/* Etiqueta superior */}
                    <Text style={s.label}>NUEVO SERVICIO MÉDICO</Text>

                    {/* Nombre médico */}
                    <Text style={s.medico} numberOfLines={2}>
                        Dr. {asignacion.doctor}
                    </Text>

                    {/* Divider */}
                    <View style={s.divider} />

                    {/* Detalles */}
                    <View style={s.detalles}>
                        {asignacion.cliente ? (
                            <DetalleRow icon="🏥" texto={asignacion.cliente} />
                        ) : null}
                        <DetalleRow icon="🕐" texto={`${turnoLabel} · ${horaStr}`} bold />
                        {asignacion.distrito ? (
                            <DetalleRow icon="📍" texto={asignacion.distrito} />
                        ) : null}
                        {asignacion.ubicacion && asignacion.ubicacion !== asignacion.distrito ? (
                            <DetalleRow icon="🗺️" texto={asignacion.ubicacion} />
                        ) : null}

                        {/* Badges tipo + origen */}
                        {(asignacion.tipoServicio || asignacion.tipoCreacion) ? (
                            <View style={s.badgeRow}>
                                {asignacion.tipoServicio ? (
                                    <View style={s.badgePill}>
                                        <Text style={s.badgePillTx}>{asignacion.tipoServicio}</Text>
                                    </View>
                                ) : null}
                                {asignacion.tipoCreacion ? (
                                    <View style={[s.badgePill, { backgroundColor: '#F3F4F6' }]}>
                                        <Text style={[s.badgePillTx, { color: C.grisTexto }]}>
                                            {asignacion.tipoCreacion === 'AUTOMATICO' ? '⚡ Auto' : '✏️ Manual'}
                                        </Text>
                                    </View>
                                ) : null}
                                {asignacion.codigo ? (
                                    <View style={[s.badgePill, { backgroundColor: '#F3F4F6' }]}>
                                        <Text style={[s.badgePillTx, { color: C.grisTexto }]}>{asignacion.codigo}</Text>
                                    </View>
                                ) : null}
                            </View>
                        ) : null}
                    </View>

                    {/* Botón ACEPTAR — único botón de acción */}
                    <TouchableOpacity
                        style={[s.btnAceptar, loading && s.btnDisabled]}
                        onPress={handleAceptar}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={s.btnTx}>✅  ACEPTAR SERVICIO</Text>
                        )}
                    </TouchableOpacity>

                    {/* Info nagging */}
                    <Text style={s.nagInfo}>
                        Si no respondes, recibirás un recordatorio en 3 minutos
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        backgroundColor: C.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 20,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#D1D5DB',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 24,
    },
    label: {
        fontSize: 11,
        letterSpacing: 1.5,
        color: C.grisTexto,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    medico: {
        fontSize: 22,
        fontWeight: '800',
        color: C.azulTexto,
        marginBottom: 20,
        lineHeight: 28,
    },
    divider: {
        height: 1,
        backgroundColor: C.borde,
        marginBottom: 20,
    },
    detalles: {
        gap: 12,
        marginBottom: 32,
    },
    detalleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    detalleIcon: {
        fontSize: 16,
        marginTop: 1,
    },
    detalleTexto: {
        flex: 1,
        fontSize: 15,
        color: C.grisTexto,
        lineHeight: 21,
    },
    detalleBold: {
        color: C.azulTexto,
        fontWeight: '700',
    },
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    badgePill: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    badgePillTx: {
        fontSize: 12,
        fontWeight: '600',
        color: C.azulTexto,
    },
    btnAceptar: {
        backgroundColor: C.verde,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: C.verde,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    btnDisabled: {
        backgroundColor: '#9CA3AF',
        shadowOpacity: 0,
        elevation: 0,
    },
    btnTx: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    nagInfo: {
        textAlign: 'center',
        color: C.muteText,
        fontSize: 11,
        marginTop: 12,
        lineHeight: 16,
    },
});
