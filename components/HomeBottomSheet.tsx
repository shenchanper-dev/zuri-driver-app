'use client';

import React, { useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, PanResponder, Platform, Dimensions,
    ActivityIndicator,
} from 'react-native';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../constants/theme';

const { height: WINDOW_H } = Dimensions.get('window');
const SHEET_PEEK = 220;
const SHEET_FULL = Math.min(WINDOW_H * 0.75, 600);

interface HomeBottomSheetProps {
    isConnected: boolean;
    onToggleConnection: () => void;
    loadingConnection?: boolean;
    stats: {
        completados: number;
        activos: number;
        pendientes: number;
    };
    hasServicioActivo?: boolean;
    onOpenServicioActivo?: () => void;
}

export function HomeBottomSheet({
    isConnected,
    onToggleConnection,
    loadingConnection = false,
    stats,
    hasServicioActivo = false,
    onOpenServicioActivo,
}: HomeBottomSheetProps) {
    const translateY = useRef(new Animated.Value(SHEET_FULL - SHEET_PEEK)).current;
    const lastOffset = useRef(SHEET_FULL - SHEET_PEEK);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
            onPanResponderMove: (_, g) => {
                const next = Math.max(0, Math.min(SHEET_FULL - SHEET_PEEK, lastOffset.current + g.dy));
                translateY.setValue(next);
            },
            onPanResponderRelease: (_, g) => {
                const next = lastOffset.current + g.dy;
                const expand = g.dy < -50 || next < (SHEET_FULL - SHEET_PEEK) / 2;
                const target = expand ? 0 : SHEET_FULL - SHEET_PEEK;
                Animated.spring(translateY, {
                    toValue: target,
                    useNativeDriver: Platform.OS !== 'web',
                    tension: 60,
                    friction: 11,
                }).start();
                lastOffset.current = target;
            },
        })
    ).current;

    return (
        <Animated.View style={[s.sheet, { height: SHEET_FULL, transform: [{ translateY }] }]}>

            {/* Drag handle */}
            <View {...panResponder.panHandlers} style={s.handleZone}>
                <View style={s.handle} />
            </View>

            {/* Status row */}
            <View style={s.statusRow}>
                <View style={s.statusLeft}>
                    <View style={[s.statusDot, isConnected ? s.dotOnline : s.dotOffline]} />
                    <Text style={s.statusTx}>
                        {isConnected ? 'En línea' : 'Estás fuera de servicio'}
                    </Text>
                </View>
            </View>

            {/* CTA button */}
            <TouchableOpacity
                style={[s.btnCta, isConnected && s.btnCtaSecondary, loadingConnection && s.btnCtaDisabled]}
                onPress={onToggleConnection}
                disabled={loadingConnection}
                activeOpacity={0.85}
            >
                {loadingConnection
                    ? <ActivityIndicator color={isConnected ? COLORS.textPrimary : COLORS.textOnDark} size="small" />
                    : <Text style={[s.btnCtaTx, isConnected && s.btnCtaTxSecondary]}>
                        {isConnected ? 'Desconectarse' : 'Conectarse'}
                    </Text>
                }
            </TouchableOpacity>

            {/* Servicio activo strip */}
            {hasServicioActivo && (
                <TouchableOpacity style={s.activoStrip} onPress={onOpenServicioActivo} activeOpacity={0.85}>
                    <View style={s.activoLeft}>
                        <View style={s.activoIconBox}>
                            <Text style={s.activoIcon}>🩺</Text>
                        </View>
                        <View>
                            <Text style={s.activoTitle}>Servicio en curso</Text>
                            <Text style={s.activoSub}>Toca para avanzar estado</Text>
                        </View>
                    </View>
                    <Text style={s.activoArrow}>›</Text>
                </TouchableOpacity>
            )}

            <View style={s.divider} />

            {/* Stats hoy */}
            <Text style={s.sectionLabel}>HOY</Text>
            <View style={s.statsCard}>
                <View style={s.statCell}>
                    <Text style={s.statNum}>{stats.completados}</Text>
                    <Text style={s.statLbl}>Completados</Text>
                </View>
                <View style={s.statSep} />
                <View style={s.statCell}>
                    <Text style={[s.statNum, stats.activos > 0 && s.statNumActive]}>{stats.activos}</Text>
                    <Text style={s.statLbl}>Activos</Text>
                </View>
                <View style={s.statSep} />
                <View style={s.statCell}>
                    <Text style={[s.statNum, stats.pendientes > 0 && s.statNumPending]}>{stats.pendientes}</Text>
                    <Text style={s.statLbl}>Pendientes</Text>
                </View>
            </View>

        </Animated.View>
    );
}

const s = StyleSheet.create({
    sheet: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        backgroundColor: COLORS.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: SPACING[4],
        paddingBottom: SPACING[6],
        ...SHADOW.modal,
    },
    handleZone: {
        paddingVertical: SPACING[3],
        alignItems: 'center',
    },
    handle: {
        width: 40, height: 4,
        backgroundColor: COLORS.borderStrong,
        borderRadius: 2,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING[3],
    },
    statusLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    dotOnline:  { backgroundColor: COLORS.success },
    dotOffline: { backgroundColor: COLORS.textMuted },
    statusTx: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.semibold,
        color: COLORS.textPrimary,
    },

    btnCta: {
        backgroundColor: COLORS.primary,
        height: 52,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING[3],
    },
    btnCtaSecondary: { backgroundColor: COLORS.surface },
    btnCtaDisabled:  { backgroundColor: COLORS.borderStrong },
    btnCtaTx: {
        color: COLORS.textOnDark,
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
        letterSpacing: 0.3,
    },
    btnCtaTxSecondary: { color: COLORS.textPrimary },

    activoStrip: {
        backgroundColor: '#F8FAFC',
        borderRadius: RADIUS.md,
        padding: SPACING[3],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING[3],
        borderLeftWidth: 4,
        borderLeftColor: COLORS.primary,
    },
    activoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    activoIconBox: {
        width: 40, height: 40,
        borderRadius: 12,
        backgroundColor: COLORS.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activoIcon: { fontSize: 18 },
    activoTitle: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.semibold,
        color: COLORS.textPrimary,
    },
    activoSub: {
        fontSize: FONT.sizes.xs,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    activoArrow: {
        fontSize: 28,
        color: COLORS.textMuted,
        lineHeight: 32,
    },

    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING[3],
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: FONT.weights.bold,
        color: COLORS.textMuted,
        letterSpacing: 1.5,
        marginBottom: SPACING[2],
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md,
        paddingVertical: SPACING[3],
    },
    statCell: { flex: 1, alignItems: 'center' },
    statNum: {
        fontSize: 22,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
    },
    statNumActive:  { color: COLORS.success },
    statNumPending: { color: COLORS.warning },
    statLbl: {
        fontSize: 11,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    statSep: {
        width: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING[1],
    },
});
