/**
 * ZURI Driver App - Login Screen
 * PIN (4 digits) + Biometrics authentication
 * Fully web-compatible with proper responsive layout
 */

import { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Vibration,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/auth';

/** Cross-platform alert */
const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
    } else {
        Alert.alert(title, message);
    }
};

export default function LoginScreen() {
    const router = useRouter();
    const {
        login,
        loginWithBiometrics,
        isLoading,
        error,
        clearError,
        biometricsAvailable,
        checkBiometrics,
    } = useAuthStore();

    const [dni, setDni] = useState('');
    const [pin, setPin] = useState('');
    const [step, setStep] = useState<'dni' | 'pin'>('dni');

    const dniRef = useRef<TextInput>(null);
    const pinRef = useRef<TextInput>(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(0.97)).current;

    useEffect(() => {
        checkBiometrics();
        Animated.spring(cardScale, {
            toValue: 1,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
        }).start();
    }, []);

    useEffect(() => {
        if (error) clearError();
    }, [dni, pin]);

    const shake = () => {
        if (Platform.OS !== 'web') Vibration.vibrate(80);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
    };

    const transitionTo = (nextStep: 'dni' | 'pin') => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
            setStep(nextStep);
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
                if (nextStep === 'pin') {
                    setTimeout(() => pinRef.current?.focus(), 100);
                } else {
                    setTimeout(() => dniRef.current?.focus(), 100);
                }
            });
        });
    };

    const handleDniSubmit = () => {
        if (dni.length !== 8) {
            showAlert('⚠️ DNI inválido', 'El DNI debe tener 8 dígitos');
            return;
        }
        Keyboard.dismiss();
        transitionTo('pin');
    };

    const handlePinChange = (text: string) => {
        const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
        setPin(digits);
        if (digits.length === 4) {
            Keyboard.dismiss();
            setTimeout(() => handleLogin(digits), 100);
        }
    };

    const handleLogin = async (pinCode: string) => {
        const success = await login(dni, pinCode);
        if (!success) {
            // Read error state after login
            const storeError = useAuthStore.getState().error || '';
            const errLower = storeError.toLowerCase();

            if (errLower.includes('revisión') || errLower.includes('pendiente') || errLower.includes('proceso') || errLower.includes('documentación')) {
                clearError();
                if (Platform.OS === 'web') {
                    const msg = storeError || 'Tu solicitud está siendo revisada por nuestro equipo.';
                    window.alert(`⏳ Registro en Revisión\n\n${msg}\n\nTe notificaremos por email cuando sea aprobada.`);
                } else {
                    Alert.alert(
                        '⏳ Registro en Revisión',
                        (storeError || 'Tu solicitud está siendo revisada.') + '\n\nTe notificaremos por email cuando sea aprobada.',
                        [{ text: 'Entendido', onPress: () => { setPin(''); transitionTo('dni'); } }],
                        { cancelable: false }
                    );
                }
                setPin('');
                if (Platform.OS === 'web') transitionTo('dni');
                return;
            }

            if (errLower.includes('rechazad')) {
                clearError();
                showAlert('❌ Solicitud Rechazada', storeError + '\n\nContacta al administrador para más información.');
                setPin('');
                transitionTo('dni');
                return;
            }

            shake();
            setPin('');
            setTimeout(() => pinRef.current?.focus(), 150);
        }
    };

    const handleBack = () => {
        setPin('');
        transitionTo('dni');
    };

    const handleRegister = () => {
        if (dni.length !== 8) {
            showAlert('⚠️ DNI Requerido', 'Ingresa tu DNI de 8 dígitos primero');
            return;
        }
        router.push({ pathname: '/(auth)/register-pin', params: { dni } });
    };

    const handleBiometricLogin = async () => {
        const success = await loginWithBiometrics();
        if (!success) {
            const err = useAuthStore.getState().error;
            if (err) showAlert('Error', err);
        }
    };

    const pinDisplay = pin;

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={['#0a1628', '#0d2347', '#0066CC']} style={styles.gradient}>
                <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.pageContainer}>
                            {/* Logo area */}
                            <View style={styles.logoArea}>
                                <View style={styles.logoIconWrap}>
                                    <Ionicons name="car-sport" size={52} color="#fff" />
                                </View>
                                <Text style={styles.logoText}>ZURI</Text>
                                <Text style={styles.logoSub}>Plataforma para Conductores</Text>
                            </View>

                            {/* Card */}
                            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: cardScale }, { translateX: shakeAnim }] }]}>
                                {step === 'dni' ? (
                                    /* ─── DNI Step ─── */
                                    <View style={styles.stepContent}>
                                        <Text style={styles.cardTitle}>Ingresa tu DNI</Text>
                                        <Text style={styles.cardSubtitle}>Para acceder a tu cuenta</Text>

                                        <TextInput
                                            ref={dniRef}
                                            style={styles.dniInput}
                                            value={dni}
                                            onChangeText={(t) => setDni(t.replace(/\D/g, '').slice(0, 8))}
                                            placeholder="12345678"
                                            placeholderTextColor="rgba(255,255,255,0.4)"
                                            keyboardType="numeric"
                                            maxLength={8}
                                            autoFocus
                                            onSubmitEditing={handleDniSubmit}
                                            returnKeyType="next"
                                        />

                                        <TouchableOpacity
                                            style={[styles.primaryBtn, dni.length !== 8 && styles.primaryBtnDisabled]}
                                            onPress={handleDniSubmit}
                                            disabled={dni.length !== 8 || isLoading}
                                        >
                                            <Text style={styles.primaryBtnText}>Continuar</Text>
                                            <Ionicons name="arrow-forward" size={18} color="#0066CC" />
                                        </TouchableOpacity>

                                        {biometricsAvailable && (
                                            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} disabled={isLoading}>
                                                <Ionicons name="finger-print" size={26} color="rgba(255,255,255,0.8)" />
                                                <Text style={styles.biometricText}>Usar biometría</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ) : (
                                    /* ─── PIN Step ─── */
                                    <View style={styles.stepContent}>
                                        <TouchableOpacity style={styles.backChip} onPress={handleBack}>
                                            <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.backChipText}>Cambiar DNI</Text>
                                        </TouchableOpacity>

                                        <Text style={styles.cardTitle}>Ingresa tu PIN</Text>
                                        <View style={styles.dniBadge}>
                                            <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.7)" />
                                            <Text style={styles.dniBadgeText}>DNI: {dni}</Text>
                                        </View>

                                        {/* PIN boxes + hidden input */}
                                        <TouchableOpacity activeOpacity={1} onPress={() => pinRef.current?.focus()}>
                                            <View style={styles.pinBoxRow}>
                                                {[0, 1, 2, 3].map((i) => {
                                                    const filled = i < pinDisplay.length;
                                                    const active = i === pinDisplay.length;
                                                    return (
                                                        <View key={i} style={[styles.pinBox, filled && styles.pinBoxFilled, active && styles.pinBoxActive]}>
                                                            {filled ? <View style={styles.pinDot} /> : null}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </TouchableOpacity>

                                        <TextInput
                                            ref={pinRef}
                                            style={styles.hiddenInput}
                                            value={pin}
                                            onChangeText={handlePinChange}
                                            keyboardType="number-pad"
                                            maxLength={4}
                                            secureTextEntry
                                            autoComplete="off"
                                        />

                                        {error ? (
                                            <View style={styles.errorBox}>
                                                <Ionicons name="alert-circle-outline" size={16} color="#ff6b6b" />
                                                <Text style={styles.errorText}>{error}</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.pinHint}>
                                                {isLoading ? 'Verificando...' : 'Toca las cajas para ingresar tu PIN'}
                                            </Text>
                                        )}

                                        {isLoading && (
                                            <View style={styles.loadingRow}>
                                                <Ionicons name="sync-outline" size={16} color="rgba(255,255,255,0.7)" />
                                                <Text style={styles.loadingText}>Verificando...</Text>
                                            </View>
                                        )}

                                        {biometricsAvailable && (
                                            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} disabled={isLoading}>
                                                <Ionicons name="finger-print" size={26} color="rgba(255,255,255,0.8)" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                {/* ─── Links ─── (STACKED, not side by side) */}
                                <View style={styles.linksContainer}>
                                    <TouchableOpacity style={styles.linkItem} onPress={handleRegister}>
                                        <Ionicons name="key-outline" size={15} color="rgba(255,255,255,0.7)" />
                                        <Text style={styles.linkText}>¿Primera vez? Configura tu PIN</Text>
                                    </TouchableOpacity>

                                    <View style={styles.linkDivider} />

                                    <TouchableOpacity style={styles.linkItem} onPress={() => router.push('/(auth)/forgot-pin')}>
                                        <Ionicons name="help-circle-outline" size={15} color="rgba(255,255,255,0.7)" />
                                        <Text style={styles.linkText}>¿Olvidaste tu PIN?</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* ─── Divider ─── */}
                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>¿Eres nuevo conductor?</Text>
                                    <View style={styles.dividerLine} />
                                </View>

                                {/* ─── Register button ─── */}
                                <TouchableOpacity style={styles.registerBtn} onPress={() => router.push('/(auth)/terms')}>
                                    <Ionicons name="person-add-outline" size={18} color="#0066CC" />
                                    <Text style={styles.registerBtnText}>Registrarme como Conductor</Text>
                                </TouchableOpacity>

                                {/* ─── Support ─── */}
                                <TouchableOpacity
                                    style={styles.supportLink}
                                    onPress={() => showAlert('📞 Soporte ZURI', 'Contáctanos:\n\nEmail: soporte@zuri.pe\nWhatsApp: +51 987 654 321')}
                                >
                                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="rgba(255,255,255,0.45)" />
                                    <Text style={styles.supportText}>¿Necesitas ayuda? Contacta a soporte</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    gradient: { flex: 1 },
    flex: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 40,
    },
    pageContainer: {
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
    },

    // Logo
    logoArea: {
        alignItems: 'center',
        marginBottom: 28,
    },
    logoIconWrap: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        marginBottom: 12,
    },
    logoText: {
        fontSize: 36,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 4,
    },
    logoSub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
        letterSpacing: 0.5,
        marginTop: 4,
    },

    // Card
    card: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        padding: 24,
        backdropFilter: 'blur(20px)',
    } as any,
    stepContent: { marginBottom: 8 },
    cardTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 6,
    },
    cardSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 20,
    },

    // DNI input
    dniInput: {
        width: '100%',
        height: 60,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        textAlign: 'center',
        letterSpacing: 6,
        marginBottom: 20,
    },

    // Primary button
    primaryBtn: {
        width: '100%',
        height: 54,
        backgroundColor: '#fff',
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 16,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#0066CC',
    },

    // Biometric
    biometricBtn: { alignItems: 'center', paddingVertical: 10 },
    biometricText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

    // Back chip (PIN step)
    backChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    backChipText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

    // DNI badge (PIN step)
    dniBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'center',
        marginBottom: 24,
    },
    dniBadgeText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

    // PIN boxes
    pinBoxRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 14,
        marginBottom: 12,
    },
    pinBox: {
        width: 58,
        height: 66,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pinBoxFilled: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderColor: 'rgba(255,255,255,0.7)',
    },
    pinBoxActive: {
        borderColor: '#fff',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
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
    pinHint: {
        textAlign: 'center',
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 12,
    },
    loadingText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

    // Error
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,100,100,0.15)',
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
    },
    errorText: { fontSize: 13, color: '#ff8a8a', flex: 1 },

    // Links — STACKED (column, not row)
    linksContainer: {
        width: '100%',
        marginTop: 20,
        marginBottom: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
    },
    linkItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 13,
        paddingHorizontal: 16,
    },
    linkDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 16,
    },
    linkText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '500',
    },

    // Divider
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    dividerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginHorizontal: 12,
        fontWeight: '500',
        whiteSpace: 'nowrap',
    } as any,

    // Register button
    registerBtn: {
        width: '100%',
        height: 52,
        backgroundColor: '#fff',
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 16,
    },
    registerBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0066CC',
    },

    // Support
    supportLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        paddingVertical: 8,
    },
    supportText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontStyle: 'italic',
    },
});
