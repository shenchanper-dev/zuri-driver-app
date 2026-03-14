/**
 * ZURI Driver App - Register PIN Screen
 * First-time PIN setup for drivers
 * Web-compatible implementation: single hidden input + styled display boxes
 */

import { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    Animated,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';

/** Cross-platform alert */
const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
    } else {
        Alert.alert(title, message);
    }
};

export default function RegisterPinScreen() {
    const router = useRouter();
    const { dni } = useLocalSearchParams<{ dni: string }>();
    const { registerPin, isLoading } = useAuthStore();

    const [step, setStep] = useState<'create' | 'confirm'>('create');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const pinInputRef = useRef<TextInput>(null);
    const confirmInputRef = useRef<TextInput>(null);

    // Animations
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        setTimeout(() => pinInputRef.current?.focus(), 400);
    }, []);

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const transitionToConfirm = () => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => {
            setStep('confirm');
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
                setTimeout(() => confirmInputRef.current?.focus(), 100);
            });
        });
    };

    const handlePinChange = (text: string) => {
        const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
        setPin(digits);

        if (digits.length === 4) {
            // Auto-advance to confirm step
            setTimeout(() => transitionToConfirm(), 150);
        }
    };

    const handleConfirmChange = (text: string) => {
        const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
        setConfirmPin(digits);

        if (digits.length === 4) {
            setTimeout(() => handleSubmit(digits), 150);
        }
    };

    const handleSubmit = async (confirmCode: string) => {
        if (pin !== confirmCode) {
            shake();
            setConfirmPin('');
            setTimeout(() => confirmInputRef.current?.focus(), 100);
            showAlert('❌ PINs no coinciden', 'El PIN de confirmación no es igual al primero. Inténtalo de nuevo.');
            return;
        }

        setSubmitting(true);
        console.log('[RegisterPin] Registrando PIN para DNI:', dni);

        try {
            const result = await registerPin(dni || '', pin, false);
            console.log('[RegisterPin] Result:', JSON.stringify(result));

            if (result.success) {
                // Navigate directly — no Alert.alert with callback (fails on web)
                console.log('[RegisterPin] ✅ PIN registrado, navegando a login...');
                router.replace('/(auth)/login');
            } else {
                shake();
                setPin('');
                setConfirmPin('');
                setStep('create');
                setTimeout(() => pinInputRef.current?.focus(), 200);
                showAlert('❌ Error', result.message || 'No se pudo registrar el PIN. Intenta nuevamente.');
            }
        } catch (error: any) {
            console.error('[RegisterPin] Error:', error);
            shake();
            showAlert('❌ Error de Conexión', error.message || 'Verifica tu conexión e intenta nuevamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const goBack = () => {
        if (step === 'confirm') {
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                setStep('create');
                setConfirmPin('');
                Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
                    setTimeout(() => pinInputRef.current?.focus(), 100);
                });
            });
        } else {
            router.back();
        }
    };

    const activePinValue = step === 'create' ? pin : confirmPin;
    const loading = submitting || isLoading;

    // Render 4 styled boxes showing current state
    const renderPinBoxes = () => (
        <Animated.View style={[styles.pinBoxRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map((i) => {
                const filled = i < activePinValue.length;
                const active = i === activePinValue.length;
                return (
                    <View
                        key={i}
                        style={[
                            styles.pinBox,
                            filled && styles.pinBoxFilled,
                            active && styles.pinBoxActive,
                        ]}
                    >
                        {filled ? (
                            <View style={styles.pinDot} />
                        ) : null}
                    </View>
                );
            })}
        </Animated.View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={['#0066CC', '#004FA3']} style={styles.gradient}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Back button */}
                    <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                        <View style={styles.backBtnInner}>
                            <Ionicons name="arrow-back" size={22} color="#fff" />
                        </View>
                    </TouchableOpacity>

                    <View style={styles.centerContent}>
                        {/* Icon */}
                        <View style={styles.iconWrap}>
                            <Ionicons
                                name={step === 'create' ? 'key-outline' : 'lock-closed-outline'}
                                size={56}
                                color="#fff"
                            />
                        </View>

                        <Animated.View style={[styles.titleWrap, { opacity: fadeAnim }]}>
                            <Text style={styles.title}>
                                {step === 'create' ? 'Crea tu PIN' : 'Confirma tu PIN'}
                            </Text>
                            <Text style={styles.subtitle}>
                                {step === 'create'
                                    ? 'Elige 4 dígitos que recordarás fácilmente'
                                    : 'Vuelve a ingresar tu PIN para confirmar'}
                            </Text>
                            <View style={styles.dniBadge}>
                                <Ionicons name="person-circle-outline" size={16} color="rgba(255,255,255,0.8)" />
                                <Text style={styles.dniText}>DNI: {dni}</Text>
                            </View>
                        </Animated.View>

                        {/* Steps indicator */}
                        <View style={styles.stepsRow}>
                            <View style={[styles.stepDot, styles.stepDotActive]} />
                            <View style={[styles.stepLine, step === 'confirm' && styles.stepLineActive]} />
                            <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]} />
                        </View>
                        <View style={styles.stepsLabels}>
                            <Text style={styles.stepLabel}>Crear</Text>
                            <Text style={styles.stepLabel}>Confirmar</Text>
                        </View>

                        {/* PIN display boxes (interactive via hidden input) */}
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {
                                const ref = step === 'create' ? pinInputRef : confirmInputRef;
                                ref.current?.focus();
                            }}
                        >
                            {renderPinBoxes()}
                        </TouchableOpacity>

                        {/* Hidden inputs that capture real input */}
                        <TextInput
                            ref={pinInputRef}
                            style={styles.hiddenInput}
                            value={pin}
                            onChangeText={handlePinChange}
                            keyboardType="number-pad"
                            maxLength={4}
                            secureTextEntry
                            autoComplete="off"
                            pointerEvents="none"
                        />
                        <TextInput
                            ref={confirmInputRef}
                            style={styles.hiddenInput}
                            value={confirmPin}
                            onChangeText={handleConfirmChange}
                            keyboardType="number-pad"
                            maxLength={4}
                            secureTextEntry
                            autoComplete="off"
                            pointerEvents="none"
                        />

                        {/* Tap to type hint */}
                        <TouchableOpacity
                            style={styles.tapHint}
                            onPress={() => {
                                const ref = step === 'create' ? pinInputRef : confirmInputRef;
                                ref.current?.focus();
                            }}
                        >
                            <Ionicons name="keypad-outline" size={16} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.tapHintText}>
                                {loading ? 'Configurando PIN...' : 'Toca aquí para ingresar con teclado'}
                            </Text>
                        </TouchableOpacity>

                        {loading && (
                            <View style={styles.loadingWrap}>
                                <ActivityIndicator color="#fff" size="small" />
                                <Text style={styles.loadingText}>Configurando PIN...</Text>
                            </View>
                        )}

                        {/* Security note */}
                        <View style={styles.securityNote}>
                            <Ionicons name="shield-checkmark-outline" size={16} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.securityText}>
                                PIN encriptado con seguridad avanzada. Evita 0000, 1111, etc.
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    gradient: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 60,
        minHeight: '100%',
    },
    backBtn: {
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
    },
    backBtnInner: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerContent: {
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        paddingTop: 20,
    },
    iconWrap: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    titleWrap: { alignItems: 'center', marginBottom: 28 },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 12,
    },
    dniBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
    },
    dniText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
    stepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 0,
    },
    stepDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    stepDotActive: { backgroundColor: '#fff' },
    stepLine: {
        width: 60,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginHorizontal: 6,
    },
    stepLineActive: { backgroundColor: '#fff' },
    stepsLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 96,
        marginBottom: 32,
    },
    stepLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
    },
    pinBoxRow: {
        flexDirection: 'row',
        gap: 14,
        marginBottom: 16,
    },
    pinBox: {
        width: 62,
        height: 70,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pinBoxFilled: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderColor: 'rgba(255,255,255,0.8)',
    },
    pinBoxActive: {
        borderColor: '#fff',
        backgroundColor: 'rgba(255,255,255,0.2)',
        // Subtle pulse via border
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 4,
    },
    pinDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#fff',
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
        pointerEvents: 'none',
    } as any,
    tapHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    tapHintText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        fontStyle: 'italic',
    },
    loadingWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 15,
        fontWeight: '500',
    },
    securityNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
        padding: 12,
        width: '100%',
        maxWidth: 340,
    },
    securityText: {
        flex: 1,
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 16,
    },
});
