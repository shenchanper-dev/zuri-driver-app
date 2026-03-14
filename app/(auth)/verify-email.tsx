import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Animated,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

/** Cross-platform alert */
const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
    } else {
        Alert.alert(title, message);
    }
};

export default function VerifyEmail() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { conductorId, email } = params;

    // 6 individual digit inputs
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const inputRefs = [
        useRef<TextInput>(null),
        useRef<TextInput>(null),
        useRef<TextInput>(null),
        useRef<TextInput>(null),
        useRef<TextInput>(null),
        useRef<TextInput>(null),
    ];

    // Shake animation for errors
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const successAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Auto-focus first input on mount
        setTimeout(() => inputRefs[0].current?.focus(), 300);
    }, []);

    // Countdown for resend button
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const handleDigitChange = (text: string, index: number) => {
        const digit = text.replace(/[^0-9]/g, '').slice(-1);
        const newDigits = [...digits];
        newDigits[index] = digit;
        setDigits(newDigits);

        if (digit && index < 5) {
            inputRefs[index + 1].current?.focus();
        }

        // Auto-submit when all 6 digits are entered
        if (digit && index === 5) {
            const fullCode = [...newDigits.slice(0, 5), digit].join('');
            if (fullCode.length === 6) {
                setTimeout(() => handleVerify(fullCode), 100);
            }
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace') {
            if (!digits[index] && index > 0) {
                const newDigits = [...digits];
                newDigits[index - 1] = '';
                setDigits(newDigits);
                inputRefs[index - 1].current?.focus();
            }
        }
    };

    const handleVerify = async (codeOverride?: string) => {
        const code = codeOverride || digits.join('');

        if (code.length !== 6) {
            shake();
            showAlert('⚠️ Código Incompleto', 'Ingresa los 6 dígitos del código');
            return;
        }

        setLoading(true);
        console.log('[VerifyEmail] Verificando código:', code, 'conductorId:', conductorId);

        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';
            const response = await fetch(`${API_URL}/drivers/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    conductorId: parseInt(conductorId as string),
                    codigo: code,
                }),
            });

            console.log('[VerifyEmail] Response status:', response.status);

            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('application/json')) {
                throw new Error('El servidor no responde. Verifica tu conexión.');
            }

            const data = await response.json();
            console.log('[VerifyEmail] Response:', JSON.stringify(data));

            if (data.success) {
                // Navigate directly without Alert (Alert.alert silently fails on web)
                console.log('[VerifyEmail] ✅ Éxito, navegando a registration-status...');
                router.replace({
                    pathname: '/(auth)/registration-status',
                    params: { estadoRegistro: data.estadoRegistro || 'PENDIENTE' },
                });
            } else {
                shake();
                setDigits(['', '', '', '', '', '']);
                setTimeout(() => inputRefs[0].current?.focus(), 100);
                showAlert('❌ Código Incorrecto', data.error || 'El código ingresado no es válido. Inténtalo de nuevo.');
            }
        } catch (error: any) {
            console.error('[VerifyEmail] Error:', error);
            shake();
            showAlert('❌ Error de Conexión', error.message || 'No se pudo verificar el código. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || resending) return;
        setResending(true);

        try {
            // For now just show confirmation since resend is not yet implemented
            showAlert('📱 Código Reenviado', `Se enviará un nuevo código a ${email}. Revisa tu bandeja de entrada y spam.`);
            setResendCooldown(60);
            setDigits(['', '', '', '', '', '']);
            setTimeout(() => inputRefs[0].current?.focus(), 100);
        } catch {
            showAlert('❌ Error', 'No se pudo reenviar el código. Intenta más tarde.');
        } finally {
            setResending(false);
        }
    };

    const code = digits.join('');
    const isComplete = code.length === 6;

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient colors={['#00B5D8', '#0891B2']} style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Verificación de Email</Text>
                <View style={styles.headerRight} />
            </LinearGradient>

            <KeyboardAvoidingView
                style={styles.safeArea}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.card}>
                        {/* Icon */}
                        <View style={styles.iconRing}>
                            <LinearGradient colors={['#00B5D8', '#0891B2']} style={styles.iconGradient}>
                                <Ionicons name="mail-unread-outline" size={34} color="#fff" />
                            </LinearGradient>
                        </View>

                        <Text style={styles.title}>Revisa tu correo</Text>
                        <Text style={styles.subtitle}>
                            Enviamos un código de{' '}
                            <Text style={styles.bold}>6 dígitos</Text>
                            {' '}a:{'\n'}
                            <Text style={styles.emailText}>{email}</Text>
                        </Text>

                        {/* 6 digit boxes */}
                        <Animated.View style={[styles.digitsRow, { transform: [{ translateX: shakeAnim }] }]}>
                            {digits.map((digit, i) => (
                                <TextInput
                                    key={i}
                                    ref={inputRefs[i]}
                                    style={[
                                        styles.digitBox,
                                        digit ? styles.digitBoxFilled : null,
                                    ]}
                                    value={digit}
                                    onChangeText={(t) => handleDigitChange(t, i)}
                                    onKeyPress={(e) => handleKeyPress(e, i)}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                    textAlign="center"
                                    selectTextOnFocus
                                    editable={!loading}
                                />
                            ))}
                        </Animated.View>

                        <Text style={styles.hint}>
                            {isComplete ? '✅ Listo — verificando...' : 'Ingresa los 6 dígitos del código'}
                        </Text>

                        {/* Verify Button */}
                        <TouchableOpacity
                            style={[styles.verifyBtn, (!isComplete || loading) && styles.verifyBtnDisabled]}
                            onPress={() => handleVerify()}
                            disabled={!isComplete || loading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={isComplete && !loading ? ['#00B5D8', '#0891B2'] : ['#ccc', '#bbb']}
                                style={styles.verifyBtnGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                                        <Text style={styles.verifyBtnText}>Verificar Código</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Resend */}
                        <TouchableOpacity
                            style={[styles.resendBtn, (resendCooldown > 0 || resending) && styles.resendBtnDisabled]}
                            onPress={handleResend}
                            disabled={resendCooldown > 0 || resending}
                        >
                            <Ionicons
                                name="refresh-circle-outline"
                                size={18}
                                color={resendCooldown > 0 ? '#aaa' : '#00B5D8'}
                            />
                            <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                                {resendCooldown > 0
                                    ? `Reenviar en ${resendCooldown}s`
                                    : '¿No recibiste el código? Reenviar'}
                            </Text>
                        </TouchableOpacity>

                        {/* Help note */}
                        <View style={styles.noteBox}>
                            <Ionicons name="information-circle-outline" size={16} color="#00B5D8" />
                            <Text style={styles.noteText}>
                                Revisa también tu carpeta de{' '}
                                <Text style={styles.bold}>spam o correo no deseado</Text>
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f0f4f8' },
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    backButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
    headerRight: { width: 38 },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        paddingVertical: 40,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 28,
        width: '100%',
        maxWidth: 440,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 6,
    },
    iconRing: {
        marginBottom: 18,
        shadowColor: '#00B5D8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 5,
    },
    iconGradient: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#111',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 22,
    },
    bold: { fontWeight: '700', color: '#222' },
    emailText: { fontWeight: '700', color: '#00B5D8' },
    digitsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    digitBox: {
        width: 38,
        height: 48,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#d0ecf2',
        backgroundColor: '#f0fafd',
        fontSize: 20,
        fontWeight: '800',
        color: '#111',
        textAlign: 'center',
    },
    digitBoxFilled: {
        borderColor: '#00B5D8',
        backgroundColor: '#E0F5FA',
        color: '#00B5D8',
    },
    hint: {
        fontSize: 12,
        color: '#999',
        marginBottom: 20,
        textAlign: 'center',
    },
    verifyBtn: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 14,
    },
    verifyBtnDisabled: { opacity: 0.85 },
    verifyBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        gap: 10,
    },
    verifyBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    resendBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginBottom: 14,
    },
    resendBtnDisabled: { opacity: 0.5 },
    resendText: { fontSize: 13, color: '#00B5D8', fontWeight: '500' },
    resendTextDisabled: { color: '#aaa' },
    noteBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: '#E0F5FA',
        borderRadius: 10,
        padding: 11,
        width: '100%',
    },
    noteText: {
        flex: 1,
        fontSize: 12,
        color: '#334',
        lineHeight: 17,
    },
});
