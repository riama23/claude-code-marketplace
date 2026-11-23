declare module 'claude-code' {
  interface PluginState {
    'model-switcher': {
      /** Alias pedido en el último cambio de modelo (p. ej. "sonnet"), o null si aún no hubo ninguno. */
      current: string | null
    }
  }
}
