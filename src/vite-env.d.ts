/// <reference types="vite/client" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': Record<string, unknown>;
    }
  }
}

export {};

