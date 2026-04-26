import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML root for web — fixes the broken height chain.
 *
 * The React Native Web hierarchy on web is:
 *   <html> → <body> → <div id="root"> → <div data-rh="true"> → <View flex:1>
 *
 * Each level needs explicit 100% height or flex:1 children collapse.
 *
 * References:
 *   - https://github.com/necolas/react-native-web/issues/940
 *   - https://github.com/Leaflet/Leaflet/issues/1266
 */
export default function Root({ children }: PropsWithChildren) {
    return (
        <html lang="es">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
                />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="theme-color" content="#1F2937" />

                <ScrollViewStyleReset />

                <style dangerouslySetInnerHTML={{ __html: globalCSS }} />
            </head>
            <body>
                <div id="root" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {children}
                </div>
            </body>
        </html>
    );
}

const globalCSS = `
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    height: 100dvh;
    overflow: hidden;
    background-color: #1F2937;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
  }

  #root {
    width: 100% !important;
    height: 100% !important;
    height: 100dvh !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }

  /* React Native Web AppRegistry wrapper — issue necolas/react-native-web#940 */
  #root > div,
  #root > div[data-rh="true"],
  div[data-rh="true"] {
    width: 100% !important;
    height: 100% !important;
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
  }

  /* Expo Router segment containers */
  [data-expo-segment] {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
  }

  /* Leaflet — only set background; component controls dimensions via inset:0 */
  .leaflet-container {
    background: #d6d6d6;
  }
  .leaflet-control-attribution { display: none !important; }

  /* Touch handling for bottom sheet drag — keep horizontal/vertical pan only */
  body { touch-action: pan-x pan-y; }
`;
