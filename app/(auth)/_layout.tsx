/**
 * ZURI Driver App - Auth Layout
 * 
 * IMPORTANTE: Todas las pantallas del flujo de auth DEBEN estar 
 * registradas aquí como Stack.Screen. Pantallas no registradas
 * causan re-renderización inestable (temblor/flicker) al navegar.
 * 
 * Flujo de registro:
 * login → terms → register-driver → verify-email → registration-status → login
 * 
 * Flujo de login existente:
 * login → register-pin → login
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                animation: 'fade',
            }}
        >
            {/* Login - fondo azul */}
            <Stack.Screen
                name="login"
                options={{
                    contentStyle: { backgroundColor: '#0066CC' },
                }}
            />

            {/* Registro de PIN - fondo azul */}
            <Stack.Screen
                name="register-pin"
                options={{
                    contentStyle: { backgroundColor: '#0066CC' },
                }}
            />

            {/* Términos y condiciones - fondo claro */}
            <Stack.Screen
                name="terms"
                options={{
                    contentStyle: { backgroundColor: '#f8f9fa' },
                    animation: 'slide_from_right',
                }}
            />

            {/* Registro de conductor - fondo claro */}
            <Stack.Screen
                name="register-driver"
                options={{
                    contentStyle: { backgroundColor: '#f8f9fa' },
                    animation: 'slide_from_right',
                }}
            />

            {/* Verificar email - fondo claro */}
            <Stack.Screen
                name="verify-email"
                options={{
                    contentStyle: { backgroundColor: '#f8f9fa' },
                    animation: 'slide_from_right',
                }}
            />

            {/* Estado de registro - fondo claro */}
            <Stack.Screen
                name="registration-status"
                options={{
                    contentStyle: { backgroundColor: '#f8f9fa' },
                    animation: 'fade',
                }}
            />
        </Stack>
    );
}
