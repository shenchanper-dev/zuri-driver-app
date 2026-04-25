import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web-only custom HTML root. Ignored by native builds.
// Forces true 100dvh viewport on mobile Chrome (PWA).
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
      <body>{children}</body>
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
    touch-action: none;
  }

  #root, #__next, body > div:first-child {
    width: 100%;
    height: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  body > div:first-child > div,
  [data-expo-segment="(tabs)"],
  [data-expo-segment="(tabs)"] > div {
    flex: 1 !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .leaflet-container {
    width: 100% !important;
    height: 100% !important;
    background: #d6d6d6;
  }
  .leaflet-control-attribution { display: none !important; }
`;
