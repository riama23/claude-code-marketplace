export type Effort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    'model-switcher': {
      /** Alias pedido en el último cambio de modelo (p. ej. "sonnet[1m]"), o null si aún no hubo ninguno. */
      current: string | null
      /** Último effort que puso el mod; null hasta entonces (se lee de settings). */
      effort: Effort | null
      /** Último fast mode que puso el mod; null hasta entonces (se lee de settings). */
      fast: boolean | null
      /** Panel desplegado. */
      isOpen: boolean
    }
  }
}
