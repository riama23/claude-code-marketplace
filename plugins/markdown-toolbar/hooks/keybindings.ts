/**
 * Sincroniza los atajos del mod en ~/.claude/keybindings.json.
 *
 * Un mod no puede declarar atajos propios: sus botones escuchan acciones del
 * engine (`action`), y el atajo de esa acción lo lee Claude Code de
 * keybindings.json, que recarga en caliente. Para que haya atajos por defecto,
 * el mod escribe allí su línea en el bloque `Global` y recuerda cuál escribió,
 * para cambiarla si la persona cambia la opción en /config. Nunca pisa un
 * atajo que la persona tenga asignado a otra acción.
 */

export const SCHEMA_URL = 'https://www.schemastore.org/claude-code-keybindings.json'

/** Un atajo que gestiona el mod: la acción que escucha su botón y el chord deseado ('' = ninguno). */
export type ManagedBinding = { action: string; chord: string }

/** Acción → chord que el mod escribió la última vez. */
export type Managed = Record<string, string>

export type SyncResult = {
  /** El archivo nuevo, o null si no hay que escribir nada. */
  text: string | null
  /** Lo que el mod gestiona ahora, para guardarlo. */
  managed: Managed
  /** Atajos que no se pudieron poner porque ya hacen otra cosa: [chord, acción que tiene]. */
  conflicts: [string, string][]
  /** El archivo existe pero no es JSON válido: no se toca. */
  isInvalid: boolean
}

type Block = { context?: unknown; bindings?: Record<string, unknown> }
type File = { bindings?: Block[] } & Record<string, unknown>

/** Normaliza un chord como lo compara Claude Code: sin mayúsculas ni espacios de más. */
export const normalizeChord = (chord: string) => chord.trim().toLowerCase().replace(/\s+/g, ' ')

export const syncKeybindings = (current: string | undefined, wanted: ManagedBinding[], previous: Managed): SyncResult => {
  let file: File

  if (current === undefined || current.trim() === '') {
    file = { $schema: SCHEMA_URL, bindings: [] }
  } else {
    try {
      const parsed: unknown = JSON.parse(current)

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object')
      }

      file = parsed as File
    } catch {
      return { text: null, managed: previous, conflicts: [], isInvalid: true }
    }
  }

  if (!Array.isArray(file.bindings)) {
    file.bindings = []
  }

  let global = file.bindings.find(b => b && b.context === 'Global')

  if (!global) {
    global = { context: 'Global', bindings: {} }
    file.bindings.push(global)
  }

  if (typeof global.bindings !== 'object' || global.bindings === null) {
    global.bindings = {}
  }

  const bindings = global.bindings
  const managed: Managed = {}
  const conflicts: [string, string][] = []
  // Sin archivo, solo se crea si hay algo que poner.
  let isChanged = false

  // Claude Code compara los chords sin mayúsculas: "Meta+E" y "meta+e" son el mismo.
  const keyOf = (chord: string) => Object.keys(bindings).find(k => normalizeChord(k) === chord)

  for (const { action, chord } of wanted) {
    const desired = normalizeChord(chord)
    const before = previous[action]
    const beforeKey = before ? keyOf(before) : undefined

    // El chord que escribió el mod antes y ya no se quiere: fuera, si sigue siendo suyo.
    if (before && before !== desired && beforeKey !== undefined && bindings[beforeKey] === action) {
      delete bindings[beforeKey]
      isChanged = true
    }

    if (!desired) {
      continue
    }

    const existing = keyOf(desired)
    const holder = existing === undefined ? undefined : bindings[existing]

    if (holder === undefined) {
      bindings[desired] = action
      managed[action] = desired
      isChanged = true
    } else if (holder === action) {
      managed[action] = desired
    } else {
      conflicts.push([desired, String(holder)])
    }
  }

  // Un bloque Global vacío que creó el mod no hace falta.
  if (Object.keys(bindings).length === 0 && !(current ?? '').includes('"Global"')) {
    file.bindings = file.bindings.filter(b => b !== global)
  }

  return {
    text: isChanged ? `${JSON.stringify(file, null, 2)}\n` : null,
    managed,
    conflicts,
    isInvalid: false,
  }
}
