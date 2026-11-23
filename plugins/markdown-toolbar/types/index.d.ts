/** Offset del ancla de selección en el borrador (UTF-16), o null sin ancla. */
export type Anchor = number | null

/** Dónde se pinta la vista previa: en la banda, bajo los botones, o en un panel lateral. */
export type PreviewMode = 'band' | 'pane'

declare module 'claude-code' {
  interface PluginState {
    'markdown-toolbar': {
      /** Ancla de selección: el otro extremo del rango, con el cursor. */
      anchor: Anchor
      /** Modo formato activo: la siguiente letra aplica una acción. */
      isLeader: boolean
      /** Vista previa activa (se guarda también en $.store, entre sesiones). */
      isPreview: boolean
      /** El borrador que pinta la vista previa; solo se actualiza con ella activa. */
      draft: string
    }
  }
}
