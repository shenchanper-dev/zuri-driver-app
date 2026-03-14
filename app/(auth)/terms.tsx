import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Image,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { TERMINOS_Y_CONDICIONES, VERSION_TERMINOS } from '@/constants/terminos';

export default function TermsScreen() {
    const router = useRouter();
    const [accepted, setAccepted] = useState(false);

    const handleContinue = () => {
        if (!accepted) {
            Alert.alert('⚠️ Términos Requeridos', 'Debes aceptar los términos y condiciones para continuar');
            return;
        }
        router.push('/(auth)/register-driver');
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header con gradiente ZURI */}
            <LinearGradient
                colors={['#00B5D8', '#0891B2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.header}
            >
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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

            {/* Título */}
            <View style={styles.titleSection}>
                <View style={styles.titleIconContainer}>
                    <LinearGradient
                        colors={['#00B5D8', '#0891B2']}
                        style={styles.titleIconGradient}
                    >
                        <Ionicons name="document-text-outline" size={28} color="#fff" />
                    </LinearGradient>
                </View>
                <View style={styles.titleTextContainer}>
                    <Text style={styles.title}>Términos y Condiciones</Text>
                    <Text style={styles.subtitle}>Lee cuidadosamente antes de continuar</Text>
                </View>
            </View>

            {/* Contenido de términos */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
            >
                <View style={styles.termsCard}>
                    <Text style={styles.termsText}>{TERMINOS_Y_CONDICIONES}</Text>
                </View>
            </ScrollView>

            {/* Footer con checkbox y botón */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setAccepted(!accepted)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkboxWrapper, accepted && styles.checkboxWrapperActive]}>
                        <Checkbox
                            value={accepted}
                            onValueChange={setAccepted}
                            style={styles.checkbox}
                            color={accepted ? '#00B5D8' : undefined}
                        />
                    </View>
                    <Text style={styles.checkboxText}>
                        He leído y acepto los{' '}
                        <Text style={styles.linkText}>términos y condiciones</Text>
                        {' '}(v{VERSION_TERMINOS})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.continueButton, !accepted && styles.continueButtonDisabled]}
                    onPress={handleContinue}
                    disabled={!accepted}
                >
                    <LinearGradient
                        colors={accepted ? ['#00B5D8', '#0891B2'] : ['#ccc', '#ccc']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.continueButtonGradient}
                    >
                        <Text style={styles.continueButtonText}>Continuar con Registro</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
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
        height: 60,
    },
    headerRight: {
        width: 40,
    },
    titleSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    titleIconContainer: {
        marginRight: 16,
    },
    titleIconGradient: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    termsCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    termsText: {
        fontSize: 14,
        lineHeight: 24,
        color: '#444',
    },
    footer: {
        backgroundColor: '#fff',
        padding: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    checkboxWrapper: {
        padding: 2,
        borderRadius: 6,
    },
    checkboxWrapperActive: {
        backgroundColor: '#E0F2FE',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
    },
    checkboxText: {
        flex: 1,
        marginLeft: 14,
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    linkText: {
        color: '#00B5D8',
        fontWeight: '600',
    },
    continueButton: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    continueButtonDisabled: {
        opacity: 1,
    },
    continueButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
