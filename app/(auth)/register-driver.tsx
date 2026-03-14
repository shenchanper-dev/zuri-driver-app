import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

/** Cross-platform alert: window.alert on web, Alert.alert on native */
const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
    } else {
        Alert.alert(title, message);
    }
};
import { VERSION_TERMINOS } from '@/constants/terminos';

const { width } = Dimensions.get('window');

interface RegistrationData {
    dni: string;
    nombres: string;
    apellidos: string;
    email: string;
    celular1: string;
    numeroLicencia: string;
    categoriaLicencia: string;
    placa: string;
    marcaVehiculo: string;
    modeloVehiculo: string;
    terminosAceptados: boolean;
    versionTerminos: string;
}

const STEPS = [
    { id: 1, title: 'Datos Personales', icon: 'person-outline', subtitle: 'Tu información básica' },
    { id: 2, title: 'Contacto', icon: 'call-outline', subtitle: 'Email y celular' },
    { id: 3, title: 'Licencia', icon: 'card-outline', subtitle: 'Datos de conducir' },
    { id: 4, title: 'Vehículo', icon: 'car-sport-outline', subtitle: 'Tu auto (opcional)' },
];

export default function RegisterDriver() {
    const router = useRouter();
    const scrollViewRef = useRef<ScrollView>(null);
    const [loading, setLoading] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);

    const [formData, setFormData] = useState<RegistrationData>({
        dni: '',
        nombres: '',
        apellidos: '',
        email: '',
        celular1: '',
        numeroLicencia: '',
        categoriaLicencia: 'A-I',
        placa: '',
        marcaVehiculo: '',
        modeloVehiculo: '',
        terminosAceptados: true,
        versionTerminos: VERSION_TERMINOS,
    });

    const updateField = (field: keyof RegistrationData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const validateStep = (): boolean => {
        switch (currentStep) {
            case 1:
                if (!formData.dni || formData.dni.length !== 8) {
                    showAlert('⚠️ DNI Requerido', 'El DNI debe tener exactamente 8 dígitos');
                    return false;
                }
                if (!formData.nombres.trim() || !formData.apellidos.trim()) {
                    showAlert('⚠️ Datos Incompletos', 'Ingresa tu nombre y apellidos completos');
                    return false;
                }
                return true;

            case 2:
                if (!formData.email || !formData.email.includes('@')) {
                    showAlert('⚠️ Email Inválido', 'Ingresa un correo electrónico válido');
                    return false;
                }
                if (!formData.celular1 || formData.celular1.length < 9) {
                    showAlert('⚠️ Celular Inválido', 'El celular debe tener al menos 9 dígitos');
                    return false;
                }
                return true;

            case 3:
                if (!formData.numeroLicencia.trim()) {
                    showAlert('⚠️ Licencia Requerida', 'Ingresa tu número de licencia');
                    return false;
                }
                return true;

            case 4:
                // Opcional - no validar
                return true;

            default:
                return true;
        }
    };

    const handleNext = () => {
        if (validateStep()) {
            if (currentStep < 4) {
                setCurrentStep(currentStep + 1);
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            } else {
                handleSubmit();
            }
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else {
            router.back();
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        console.log('[Register] Enviando registro...', formData.dni);

        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';
            console.log('[Register] API URL:', `${API_URL}/drivers/register`);

            const response = await fetch(`${API_URL}/drivers/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            console.log('[Register] Response status:', response.status);

            // Check if response is HTML (error)
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('[Register] Non-JSON response:', text.substring(0, 200));
                throw new Error('El servidor no responde correctamente. Intenta de nuevo.');
            }

            const data = await response.json();
            console.log('[Register] Response data:', JSON.stringify(data));

            if (data.success || data.conductorId) {
                console.log('[Register] ✅ Éxito, navigando a verify-email...');
                router.replace({
                    pathname: '/(auth)/verify-email',
                    params: {
                        conductorId: String(data.conductorId),
                        email: formData.email,
                    },
                });
            } else {
                showAlert('❌ Error', data.error || 'No se pudo completar el registro');
            }
        } catch (error: any) {
            console.error('[Register] Error:', error);
            showAlert('❌ Error de Conexión', error.message || 'Verifica tu conexión a internet e intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    const renderStepIndicator = () => (
        <View style={styles.stepIndicatorContainer}>
            {STEPS.map((step, index) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;

                return (
                    <View key={step.id} style={styles.stepIndicatorItem}>
                        <View style={[
                            styles.stepCircle,
                            isActive && styles.stepCircleActive,
                            isCompleted && styles.stepCircleCompleted,
                        ]}>
                            {isCompleted ? (
                                <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : (
                                <Text style={[
                                    styles.stepNumber,
                                    (isActive || isCompleted) && styles.stepNumberActive
                                ]}>
                                    {step.id}
                                </Text>
                            )}
                        </View>
                        {index < STEPS.length - 1 && (
                            <View style={[
                                styles.stepLine,
                                isCompleted && styles.stepLineCompleted
                            ]} />
                        )}
                    </View>
                );
            })}
        </View>
    );

    const renderInput = (
        label: string,
        value: string,
        field: keyof RegistrationData,
        placeholder: string,
        options: {
            icon?: string;
            keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
            maxLength?: number;
            autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
            optional?: boolean;
        } = {}
    ) => (
        <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>
                    {label} {!options.optional && <Text style={styles.required}>*</Text>}
                </Text>
                {options.optional && <Text style={styles.optionalBadge}>Opcional</Text>}
            </View>
            <View style={styles.inputWrapper}>
                {options.icon && (
                    <Ionicons name={options.icon as any} size={20} color="#667eea" style={styles.inputIcon} />
                )}
                <TextInput
                    style={[styles.input, options.icon && styles.inputWithIcon]}
                    placeholder={placeholder}
                    placeholderTextColor="#999"
                    value={value}
                    onChangeText={(text) => updateField(field, text)}
                    keyboardType={options.keyboardType || 'default'}
                    maxLength={options.maxLength}
                    autoCapitalize={options.autoCapitalize || 'words'}
                />
            </View>
        </View>
    );

    const renderStep = () => {
        const stepInfo = STEPS[currentStep - 1];

        return (
            <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                    <View style={styles.stepIconContainer}>
                        <LinearGradient
                            colors={['#00B5D8', '#0891B2']}
                            style={styles.stepIconGradient}
                        >
                            <Ionicons name={stepInfo.icon as any} size={28} color="#fff" />
                        </LinearGradient>
                    </View>
                    <View style={styles.stepTitleContainer}>
                        <Text style={styles.stepTitle}>{stepInfo.title}</Text>
                        <Text style={styles.stepSubtitle}>{stepInfo.subtitle}</Text>
                    </View>
                </View>

                <View style={styles.formCard}>
                    {currentStep === 1 && (
                        <>
                            {renderInput('DNI', formData.dni, 'dni', '12345678', {
                                icon: 'id-card-outline',
                                keyboardType: 'numeric',
                                maxLength: 8,
                            })}
                            {renderInput('Nombres', formData.nombres, 'nombres', 'Ingresa tus nombres', {
                                icon: 'person-outline',
                            })}
                            {renderInput('Apellidos', formData.apellidos, 'apellidos', 'Ingresa tus apellidos', {
                                icon: 'people-outline',
                            })}
                        </>
                    )}

                    {currentStep === 2 && (
                        <>
                            {renderInput('Correo Electrónico', formData.email, 'email', 'tucorreo@email.com', {
                                icon: 'mail-outline',
                                keyboardType: 'email-address',
                                autoCapitalize: 'none',
                            })}
                            {renderInput('Número de Celular', formData.celular1, 'celular1', '987654321', {
                                icon: 'call-outline',
                                keyboardType: 'phone-pad',
                                maxLength: 9,
                            })}
                            <View style={styles.infoCard}>
                                <Ionicons name="information-circle" size={20} color="#667eea" />
                                <Text style={styles.infoText}>
                                    Te enviaremos un código de verificación a tu correo electrónico.
                                </Text>
                            </View>
                        </>
                    )}

                    {currentStep === 3 && (
                        <>
                            {renderInput('Número de Licencia', formData.numeroLicencia, 'numeroLicencia', 'Q12345678', {
                                icon: 'card-outline',
                                autoCapitalize: 'characters',
                            })}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>
                                    Categoría <Text style={styles.required}>*</Text>
                                </Text>
                                <View style={styles.categoryGrid}>
                                    {['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'].map((cat) => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[
                                                styles.categoryChip,
                                                formData.categoriaLicencia === cat && styles.categoryChipActive,
                                            ]}
                                            onPress={() => updateField('categoriaLicencia', cat)}
                                        >
                                            <Text style={[
                                                styles.categoryChipText,
                                                formData.categoriaLicencia === cat && styles.categoryChipTextActive,
                                            ]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}

                    {currentStep === 4 && (
                        <>
                            <View style={styles.optionalHeader}>
                                <Ionicons name="information-circle-outline" size={20} color="#667eea" />
                                <Text style={styles.optionalHeaderText}>
                                    Puedes completar estos datos después desde tu perfil
                                </Text>
                            </View>
                            {renderInput('Placa', formData.placa, 'placa', 'ABC-123', {
                                icon: 'car-outline',
                                autoCapitalize: 'characters',
                                maxLength: 7,
                                optional: true,
                            })}
                            {renderInput('Marca', formData.marcaVehiculo, 'marcaVehiculo', 'Toyota, Hyundai, etc.', {
                                icon: 'business-outline',
                                optional: true,
                            })}
                            {renderInput('Modelo', formData.modeloVehiculo, 'modeloVehiculo', 'Corolla, Accent, etc.', {
                                icon: 'car-sport-outline',
                                optional: true,
                            })}
                        </>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header with Logo */}
            <LinearGradient
                colors={['#00B5D8', '#0891B2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.header}
            >
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Image
                        source={require('@/assets/logo-zuri.png')}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.headerRight} />
            </LinearGradient>

            {/* Step Indicator */}
            {renderStepIndicator()}

            {/* Content */}
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {renderStep()}
                </ScrollView>

                {/* Footer Actions */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={handleBack}
                        disabled={loading}
                    >
                        <Ionicons name="arrow-back" size={20} color="#667eea" />
                        <Text style={styles.secondaryButtonText}>
                            {currentStep === 1 ? 'Cancelar' : 'Atrás'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleNext}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.primaryButtonText}>
                                    {currentStep === 4 ? 'Registrarme' : 'Continuar'}
                                </Text>
                                <Ionicons
                                    name={currentStep === 4 ? 'checkmark-circle' : 'arrow-forward'}
                                    size={20}
                                    color="#fff"
                                />
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    logoImage: {
        width: 120,
        height: 80,
    },
    headerRight: {
        width: 40,
    },
    stepIndicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
        paddingVertical: 20,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    stepIndicatorItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e0e0e0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepCircleActive: {
        backgroundColor: '#00B5D8',
    },
    stepCircleCompleted: {
        backgroundColor: '#4caf50',
    },
    stepNumber: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    stepNumberActive: {
        color: '#fff',
    },
    stepLine: {
        width: (width - 200) / 3,
        height: 3,
        backgroundColor: '#e0e0e0',
        marginHorizontal: 4,
    },
    stepLineCompleted: {
        backgroundColor: '#4caf50',
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    stepContent: {
        flex: 1,
    },
    stepHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    stepIconContainer: {
        marginRight: 16,
    },
    stepIconGradient: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepTitleContainer: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    stepSubtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    formCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    inputGroup: {
        marginBottom: 20,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    required: {
        color: '#e74c3c',
    },
    optionalBadge: {
        fontSize: 11,
        color: '#667eea',
        backgroundColor: '#f0f4ff',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#e0e0e0',
    },
    inputIcon: {
        marginLeft: 16,
    },
    input: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1a1a1a',
    },
    inputWithIcon: {
        paddingLeft: 12,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    categoryChipActive: {
        backgroundColor: '#E0F2FE',
        borderColor: '#00B5D8',
    },
    categoryChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    categoryChipTextActive: {
        color: '#00B5D8',
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0F2FE',
        padding: 16,
        borderRadius: 12,
        marginTop: 8,
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#555',
        lineHeight: 18,
    },
    optionalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0F2FE',
        padding: 14,
        borderRadius: 12,
        marginBottom: 20,
        gap: 10,
    },
    optionalHeaderText: {
        flex: 1,
        fontSize: 13,
        color: '#555',
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: 24,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        gap: 12,
    },
    secondaryButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: '#E0F2FE',
        gap: 8,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#00B5D8',
    },
    primaryButton: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: '#00B5D8',
        gap: 8,
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
