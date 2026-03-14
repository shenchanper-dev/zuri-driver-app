/**
 * ZURI Driver App - Forgot PIN Screen
 * Identity verification (DNI + Phone) and PIN Reset
 */

import { useState, useRef } from 'react';
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
    ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';

export default function ForgotPinScreen() {
    const router = useRouter();
    const { resetPin, isLoading, error, clearError } = useAuthStore();

    // State
    const [dni, setDni] = useState('');
    const [celular, setCelular] = useState('');
    const [nuevoPin, setNuevoPin] = useState(['', '', '', '']);
    const [confirmarPin, setConfirmarPin] = useState(['', '', '', '']);
    const [step, setStep] = useState<'verify' | 'reset'>('verify');
    const [verifiedName, setVerifiedName] = useState('');

    // Refs for inputs
    const pinRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
    const confirmRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];

    // Handle initial verification
    const handleVerify = async () => {
        if (dni.length !== 8) {
            Alert.alert('Error', 'El DNI debe tener 8 dígitos');
            return;
        }
        if (celular.length < 9) {
            Alert.alert('Error', 'Ingresa tu número de celular registrado');
            return;
        }

        const result = await resetPin({ dni, celular, step: 'verify' });

        if (result.success && result.verified) {
            setVerifiedName(result.conductorNombre || '');
            setStep('reset');
        } else {
            Alert.alert('Verificación Fallida', result.message || 'La información no coincide');
        }
    };

    // Handle PIN input change
    const handlePinChange = (text: string, index: number, isConfirm: boolean) => {
        if (!/^\d*$/.test(text)) return;

        const targetPin = isConfirm ? confirmarPin : nuevoPin;
        const setTargetPin = isConfirm ? setConfirmarPin : setNuevoPin;
        const targetRefs = isConfirm ? confirmRefs : pinRefs;

        const newPin = [...targetPin];
        newPin[index] = text;
        setTargetPin(newPin);

        if (text && index < 3) {
            targetRefs[index + 1].current?.focus();
        }
    };

    const handlePinKeyPress = (e: any, index: number, isConfirm: boolean) => {
        const targetPin = isConfirm ? confirmarPin : nuevoPin;
        const targetRefs = isConfirm ? confirmRefs : pinRefs;

        if (e.nativeEvent.key === 'Backspace' && !targetPin[index] && index > 0) {
            targetRefs[index - 1].current?.focus();
        }
    };

    // Handle Final submission
    const handleReset = async () => {
        const pin1 = nuevoPin.join('');
        const pin2 = confirmarPin.join('');

        if (pin1.length !== 4 || pin2.length !== 4) {
            Alert.alert('Error', 'El PIN debe ser de 4 dígitos');
            return;
        }

        if (pin1 !== pin2) {
            Alert.alert('Error', 'Los PINs no coinciden');
            return;
        }

        const result = await resetPin({
            dni,
            celular,
            nuevoPin: pin1,
            confirmarPin: pin2,
            step: 'reset'
        });

        if (result.success) {
            Alert.alert('✅ Éxito', 'Tu PIN ha sido actualizado. Ahora puedes iniciar sesión.', [
                { text: 'Ir al Login', onPress: () => router.replace('/(auth)/login') }
            ]);
        } else {
            Alert.alert('Error', result.message || 'No se pudo actualizar el PIN');
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={28} color="#fff" />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Ionicons name="key-outline" size={60} color="#fff" />
                    <Text style={styles.title}>Recuperar PIN</Text>
                    <Text style={styles.subtitle}>
                        {step === 'verify'
                            ? 'Verifica tus datos registrados para crear un nuevo PIN'
                            : `Hola ${verifiedName}, crea tu nuevo PIN de 4 dígitos`}
                    </Text>
                </View>

                {step === 'verify' ? (
                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Número de DNI</Text>
                            <TextInput
                                style={styles.input}
                                value={dni}
                                onChangeText={(t) => setDni(t.replace(/\D/g, ''))}
                                placeholder="8 dígitos"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType="numeric"
                                maxLength={8}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Celular Registrado</Text>
                            <TextInput
                                style={styles.input}
                                value={celular}
                                onChangeText={(t) => setCelular(t.replace(/\D/g, ''))}
                                placeholder="9 dígitos"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType="numeric"
                                maxLength={9}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, (dni.length < 8 || celular.length < 9) && styles.buttonDisabled]}
                            onPress={handleVerify}
                            disabled={isLoading || dni.length < 8 || celular.length < 9}
                        >
                            <Text style={styles.buttonText}>{isLoading ? 'Verificando...' : 'Verificar Identidad'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.form}>
                        <Text style={styles.pinLabel}>Nuevo PIN</Text>
                        <View style={styles.pinContainer}>
                            {nuevoPin.map((digit, i) => (
                                <TextInput
                                    key={`new-${i}`}
                                    ref={pinRefs[i]}
                                    style={styles.pinInput}
                                    value={digit}
                                    onChangeText={(t) => handlePinChange(t, i, false)}
                                    onKeyPress={(e) => handlePinKeyPress(e, i, false)}
                                    keyboardType="numeric"
                                    maxLength={1}
                                    secureTextEntry
                                />
                            ))}
                        </View>

                        <Text style={styles.pinLabel}>Confirmar Nuevo PIN</Text>
                        <View style={styles.pinContainer}>
                            {confirmarPin.map((digit, i) => (
                                <TextInput
                                    key={`conf-${i}`}
                                    ref={confirmRefs[i]}
                                    style={styles.pinInput}
                                    value={digit}
                                    onChangeText={(t) => handlePinChange(t, i, true)}
                                    onKeyPress={(e) => handlePinKeyPress(e, i, true)}
                                    keyboardType="numeric"
                                    maxLength={1}
                                    secureTextEntry
                                />
                            ))}
                        </View>

                        <Text style={styles.infoText}>
                            Reglas del PIN:{"\n"}
                            • No puede ser 1234{"\n"}
                            • No puede tener todos los números iguales (1111){"\n"}
                            • Se permiten pares (2233, 6677, etc.)
                        </Text>

                        <TouchableOpacity
                            style={[styles.button, styles.resetButton]}
                            onPress={handleReset}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>{isLoading ? 'Actualizando...' : 'Actualizar PIN'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0066CC',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        paddingTop: 60,
    },
    backButton: {
        marginBottom: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 10,
    },
    subtitle: {
        fontSize: 16,
        color: '#E0E0E0',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 22,
    },
    form: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        color: '#fff',
        fontSize: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    pinLabel: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: '600',
    },
    pinContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 15,
        marginBottom: 30,
    },
    pinInput: {
        width: 56,
        height: 60,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        fontSize: 24,
        color: '#fff',
        textAlign: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    button: {
        backgroundColor: '#fff',
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    resetButton: {
        backgroundColor: '#00C851', // Success green
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#0066CC',
        fontSize: 18,
        fontWeight: 'bold',
    },
    infoText: {
        color: '#E0E0E0',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 10,
    }
});
