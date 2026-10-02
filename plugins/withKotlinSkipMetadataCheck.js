// ============================================================================
// Expo config plugin — withKotlinSkipMetadataCheck
// ============================================================================
// POR QUÉ EXISTE:
//   El AAR `org.traccar:traccar-client-sdk-android:1.0.11` (y toda la familia
//   1.0.5 → 1.0.11, verificado leyendo `@kotlin.Metadata(mv=[])` de cada
//   `Config.class` con `javap -v`) fue publicado con Kotlin 2.3 (mv=[2,3,0])
//   y arrastra `kotlin-stdlib:2.3.21` como dependencia transitiva.
//   Expo SDK 54 compila con Kotlin 2.1.20 y tope 2.2.20 (validado contra la
//   whitelist `KSPLookup.kt` de `expo-modules-autolinking`).
//   Gap irreconciliable por la vía normal: 2.1 < 2.3.
//
//   Sin este flag el build falla en `:app:compileReleaseKotlin` con:
//     e: ...kotlin-stdlib.kotlin_module Module was compiled with an
//        incompatible version of Kotlin.
//        The binary version of its metadata is 2.3.0, expected version is 2.1.0.
//
//   El flag hace que el compilador Kotlin IGNORE el chequeo de metadata
//   version del AAR y de la stdlib arrastrada por él, y lea el bytecode igual.
//   Es la misma técnica que usa Transistorsoft internamente en producción
//   (precedente establecido).
//
// RIESGO:
//   Si el SDK Traccar usara APIs del lenguaje Kotlin 2.2/2.3 que el compilador
//   2.1.20 NO entienda, el error reaparecería en runtime o en otra fase.
//   Verificado experimentalmente el 2026-10-01: compila limpio y genera APK
//   funcional. Si en algún upgrade futuro del SDK esto cambia, el síntoma
//   sería `Unresolved reference` / `cannot find symbol` en el compile.
//
// CUÁNDO BORRARLO (checklist para quitarlo sin dejar deuda oculta):
//   1. Verificar que Expo autolinking usa Kotlin ≥ 2.3:
//        grep kotlinVersion node_modules/expo-modules-autolinking/.../ExpoRootProjectPlugin.kt
//        (debe decir ≥ "2.3.x")
//      Y comprobar la whitelist:
//        grep '"2\.3' node_modules/expo-modules-autolinking/.../KSPLookup.kt
//   2. Ejecutar `npx expo prebuild --clean --platform android` SIN este plugin
//      y comprobar que `./gradlew :app:assembleRelease` pasa limpio.
//   3. Si pasa: borrar este archivo (`rm -rf plugins/`) y la línea
//      `"./plugins/withKotlinSkipMetadataCheck"` del array `plugins` en
//      `app.json`.
//   4. Prebuild + build de nuevo para confirmar.
//
//   Si Traccar publicara una versión del SDK compilada con Kotlin ≤ 2.2.20,
//   ese downgrade también elimina la necesidad del flag (al 2026-10-01 todas
//   las versiones publicadas, 1.0.5 → 1.0.11, están con Kotlin 2.3).
//
// REVERSIÓN RÁPIDA (en caso de duda, cambio reversible en < 1 minuto):
//   git checkout -- app.json && rm -rf plugins/
//   npx expo prebuild --clean --platform android --no-install
// ============================================================================

const { withAppBuildGradle } = require('@expo/config-plugins');

const KOTLIN_OPTS_BLOCK = `
    kotlinOptions {
        freeCompilerArgs += "-Xskip-metadata-version-check"
    }
`;

const withKotlinSkipMetadataCheck = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes('-Xskip-metadata-version-check')) return cfg;
    cfg.modResults.contents = contents.replace(
      /(\bandroid\s*\{)/,
      `$1\n${KOTLIN_OPTS_BLOCK}`
    );
    return cfg;
  });
};

module.exports = withKotlinSkipMetadataCheck;
