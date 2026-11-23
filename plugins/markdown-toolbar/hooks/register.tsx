import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { syncKeybindings } from './keybindings'
import type { Managed } from './keybindings'
import { applyAction, decorate, KEYS, shiftOffset } from './markdown'
import type { Command } from './markdown'
import type { Anchor, PreviewMode } from '../types'

const PLUGIN = 'markdown-toolbar'
/** Id del panel lateral de la vista previa. */
export const PANE = 'markdown-preview'

/**
 * Acciones del engine que escuchan los botones ¶ y v. Un mod no puede declarar
 * atajos propios, así que se usan acciones cuyo handler no existe en el prompt:
 * theme:editCustom solo vive en el selector de tema y diff:back en el visor de
 * diff antiguo. El mod les asigna atajo en ~/.claude/keybindings.json.
 */
export const LEADER_ACTION = 'theme:editCustom'
export const PREVIEW_ACTION = 'diff:back'

const STORE_PREVIEW = 'isPreview'
const STORE_MANAGED = 'managedKeybindings'

const anchor = atom({ plugin: 'markdown-toolbar', key: 'anchor' } as const, null)
const isLeader = atom({ plugin: 'markdown-toolbar', key: 'isLeader' } as const, false)
const isPreview = atom({ plugin: 'markdown-toolbar', key: 'isPreview' } as const, false)
const draft = atom({ plugin: 'markdown-toolbar', key: 'draft' } as const, '')

type Settings = { mode: PreviewMode; previewChord: string; leaderChord: string }

/** Las opciones de /config, con sus valores por defecto si faltan. */
export const settingsOf = (options: PluginOptions): Settings => ({
  mode: options['previewMode'] === 'pane' ? 'pane' : 'band',
  previewChord: typeof options['previewShortcut'] === 'string' ? options['previewShortcut'] : 'ctrl+shift+p',
  leaderChord: typeof options['formatShortcut'] === 'string' ? options['formatShortcut'] : 'meta+e',
})

type BandButton = { letter: string; label: string; action: Command }

/**
 * Botones de la banda por grupos: texto, enlace, bloques, ancla y vista previa.
 * `letter` es a la vez su hotkey (con la banda enfocada, Ctrl+X Tab) y su tecla
 * en modo formato.
 */
export const GROUPS: BandButton[][] = [
  [
    { letter: 'b', label: 'B', action: 'bold' },
    { letter: 'i', label: 'I', action: 'italic' },
    { letter: 's', label: 'S', action: 'strike' },
    { letter: 'c', label: '`c`', action: 'code' },
  ],
  [{ letter: 'k', label: 'Link', action: 'link' }],
  [
    { letter: 'l', label: '•', action: 'bullet' },
    { letter: 'n', label: '1.', action: 'numbered' },
    { letter: 'q', label: '>', action: 'quote' },
    { letter: 'p', label: '```', action: 'codeblock' },
    { letter: 'h', label: '#', action: 'heading' },
  ],
  [{ letter: 'm', label: '⚑', action: 'anchor' }],
  [{ letter: 'v', label: 'Vista', action: 'preview' }],
]

/** Columnas a partir de las que cabe la pista de atajo al final de la banda. */
const HINT_COLUMNS = 112

/** Lo más largo que pinta la vista previa: una sola drawing admite 100000 caracteres. */
const MAX_PREVIEW = 20000

/**
 * Lo que `Markdown` acepta: tab y salto de línea son los únicos caracteres de
 * control, y un texto enorme (un pegado) se corta para no pasar del límite.
 */
const printable = (text: string) => {
  const clean = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')

  return clean.length > MAX_PREVIEW ? `${clean.slice(0, MAX_PREVIEW)}\n\n…` : clean
}

/** El ancla solo vale si cae dentro del borrador actual. */
const validAnchor = (a: Anchor, text: string): Anchor => (a !== null && a <= text.length ? a : null)

const setAnchor = async ($: EngineInterface, value: Anchor) => {
  if ((await read($, anchor)) !== value) {
    await update($, anchor, () => value)
  }
}

/** Con la vista previa activa, guarda el borrador para que la banda o el panel lo pinten. */
const syncDraft = async ($: EngineInterface, text: string) => {
  if ((await read($, isPreview)) && (await read($, draft)) !== text) {
    await update($, draft, () => text)
  }
}

const showPane = async ($: EngineInterface) => {
  const opened = await $.ui.open({ id: PANE, title: 'Vista previa' })

  if (!opened.isPlaced && opened.reason) {
    $.ui.log(`markdown-toolbar: la vista previa espera sitio (${opened.reason})`)
  }
}

/** `text`: el borrador, si quien llama ya lo tiene (un hook de prompt.edit no relee el prompt). */
const setPreview = async ($: EngineInterface, on: boolean, mode: PreviewMode, text?: string) => {
  await update($, isPreview, () => on)
  await $.store.set(STORE_PREVIEW, on).catch(() => undefined)

  if (on) {
    const current = text ?? (await $.prompt.read()).text
    await update($, draft, () => current)
  }

  if (mode === 'pane') {
    await (on ? showPane($) : $.ui.close({ id: PANE }))
  }
}

const togglePreview = async ($: EngineInterface, mode: PreviewMode, text?: string) =>
  setPreview($, !(await read($, isPreview)), mode, text)

/** Pone en keybindings.json los atajos de /config y quita los que el mod puso antes. */
const syncShortcuts = async ($: EngineInterface, settings: Settings) => {
  const home = await $.env.get('HOME')

  if (!home) {
    return
  }

  const path = `${home}/.claude/keybindings.json`
  let current: string | undefined

  if (await $.fs.exists(path)) {
    // Si existe pero no se puede leer, no se toca: escribirlo lo borraría.
    current = await $.fs.read(path)
  }

  const stored = await $.store.get(STORE_MANAGED)
  const previous: Managed =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? Object.fromEntries(Object.entries(stored).filter((kv): kv is [string, string] => typeof kv[1] === 'string'))
      : {}

  const result = syncKeybindings(
    current,
    [
      { action: PREVIEW_ACTION, chord: settings.previewChord },
      { action: LEADER_ACTION, chord: settings.leaderChord },
    ],
    previous,
  )

  if (result.isInvalid) {
    $.ui.toast('markdown-toolbar: ~/.claude/keybindings.json no es JSON válido; no se han añadido sus atajos.')

    return
  }

  if (result.text !== null) {
    await $.fs.write(path, result.text)
  }

  await $.store.set(STORE_MANAGED, result.managed)

  for (const [chord, holder] of result.conflicts) {
    $.ui.toast(`markdown-toolbar: ${chord} ya hace ${holder}; elige otro atajo en /config.`)
  }
}

/** Una acción desde un botón de la banda: lee el borrador, lo transforma y lo vuelve a escribir. */
const runFromBand = async ($: EngineInterface, action: Command, mode: PreviewMode) => {
  await update($, isLeader, () => false)

  if (action === 'preview') {
    await togglePreview($, mode)

    return
  }

  const box = await $.prompt.read()
  const a = validAnchor(await read($, anchor), box.text)

  if (action === 'anchor') {
    const next = a === null ? box.cursor : null
    await setAnchor($, next)
    await $.prompt.paint({ text: box.text, decorations: decorate(box.text, next, box.cursor) })

    return
  }

  const result = applyAction(action, box, a)
  await setAnchor($, null)
  const filled = await $.prompt.fill({
    text: result.text,
    cursor: result.cursor,
    decorations: decorate(result.text, null, result.cursor),
  })

  if (filled.isFilled) {
    await syncDraft($, result.text)
  } else if (filled.refusal === 'dialog') {
    $.ui.toast('Cierra el diálogo para dar formato al prompt.')
  }
}

/** La letra pulsada en una edición, si fue una sola tecla sin Ctrl ni Meta. */
const typedLetter = (e: { key?: { key: string; ctrl?: true; meta?: true }; start: number; end: number; inputText: string }) => {
  if (e.key) {
    return e.key.ctrl || e.key.meta || e.key.key.length !== 1 ? undefined : e.key.key
  }

  return e.start === e.end && e.inputText.length === 1 ? e.inputText : undefined
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)

  // Al arrancar (y al recargar tras cambiar /config): atajos, y la vista previa como se dejó.
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    await syncShortcuts($, settings).catch(err =>
      $.ui.toast(`markdown-toolbar: no se pudieron poner los atajos (${err instanceof Error ? err.message : String(err)}).`),
    )

    const isOn = (await $.store.get(STORE_PREVIEW).catch(() => false)) === true
    await update($, isPreview, () => isOn)

    if (isOn) {
      // Tras una recarga (p. ej. al cambiar /config) el borrador sigue en el prompt.
      const box = await $.prompt.read().catch(() => ({ text: '' }))
      await update($, draft, () => box.text)
    }

    // En modo banda no hay panel; en modo panel se reabre si estaba activa.
    await (isOn && settings.mode === 'pane' ? showPane($) : $.ui.close({ id: PANE })).catch(() => undefined)

    return result
  })

  // Cerrar el panel a mano apaga la vista previa.
  on('ui.close', async ($, e, next) => {
    const result = await next(e)

    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, isPreview, () => false)
      await $.store.set(STORE_PREVIEW, false).catch(() => undefined)
    }

    return result
  })
    // Un fallo del mod nunca deja el panel abierto contra la voluntad de la persona.
    .catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    const a = validAnchor(await read($, anchor), e.text)

    if (await read($, isLeader)) {
      await update($, isLeader, () => false)
      const letter = typedLetter(e)
      const action = letter === undefined ? undefined : KEYS[letter.toLowerCase()]

      // Una letra de acción se consume; cualquier otra tecla sale del modo y se escribe.
      if (action === 'anchor' || action === 'preview') {
        const value = action === 'anchor' ? (a === null ? e.cursor : null) : a

        if (action === 'anchor') {
          await setAnchor($, value)
        } else {
          await togglePreview($, settings.mode, e.text)
        }

        return { text: e.text, cursor: e.cursor, decorations: decorate(e.text, value, e.cursor) }
      }

      if (action) {
        const result = applyAction(action, { text: e.text, cursor: e.cursor }, a)
        await setAnchor($, null)
        await syncDraft($, result.text)

        return { ...result, decorations: decorate(result.text, null, result.cursor) }
      }
    }

    const result = await next(e)
    let moved = a === null ? null : shiftOffset(a, e.start, e.end, e.inputText)

    if (moved !== null && (result.text === '' || moved > result.text.length)) {
      moved = null
    }

    if (moved !== a) {
      await setAnchor($, moved)
    }

    await syncDraft($, result.text)

    return {
      ...result,
      decorations: [...(result.decorations ?? []), ...decorate(result.text, moved, result.cursor)],
    }
  })
    // Si algo del mod falla, la tecla llega al editor como sin el mod (o se reusa
    // la respuesta que el editor ya dio).
    .catch(($, e, next) => next(e))

  // Historial, envío, deshacer, autocompletado u otro mod cambian el texto: el ancla
  // ya no apunta a nada fiable, y la pintura se pierde, así que se repinta.
  on('prompt.change', async ($, e, next) => {
    const result = await next(e)
    const isOwn = e.origin.kind === 'plugin' && e.origin.name === PLUGIN

    await syncDraft($, e.text).catch(() => undefined)

    if (!isOwn) {
      await setAnchor($, null).catch(() => undefined)

      if (e.origin.kind === 'clear') {
        await update($, isLeader, () => false).catch(() => undefined)
      }

      if (e.text !== '') {
        void $.prompt.paint({ text: e.text, decorations: decorate(e.text, null, e.cursor) }).catch(() => undefined)
      }
    }

    return result
  })

  // La banda de formato va debajo de las demás (p. ej. la de model-switcher).
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) =>
    next({
      ...e,
      props: {
        ...e.props,
        rows: [...e.props.rows.filter(r => r.plugin !== PLUGIN), ...e.props.rows.filter(r => r.plugin === PLUGIN)],
      },
    }),
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const text = await read($, draft)

    return (
      <Box flexDirection="column" paddingX={1}>
        {text.trim() ? <Markdown text={printable(text)} /> : <Text dimColor>Escribe en el prompt para ver la vista previa.</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.isWorking) {
      return next(e)
    }

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const leader = await read($, isLeader)
    const hasAnchor = (await read($, anchor)) !== null
    const preview = await read($, isPreview)

    const labelOf = (b: BandButton) => {
      if (b.action === 'anchor' && hasAnchor) {
        return `${b.label} puesta`
      }

      return b.action === 'preview' && preview ? `${b.label} ●` : b.label
    }

    // Cada botón lleva su letra como hotkey: sin configurar nada, Ctrl+X Tab enfoca la
    // banda y la letra lo pulsa (Esc vuelve al prompt). `plain` la dibuja en color
    // de acento delante de la etiqueta: "b: B". El botón v escucha además el atajo
    // de la vista previa, y ¶ el del modo formato (ver LEADER_ACTION).
    const group = (buttons: BandButton[], i: number) => (
      <Box key={`group-${i}`} flexDirection="row" columnGap={2}>
        {buttons.map(b => (
          <Button
            key={b.letter}
            label={labelOf(b)}
            hotkey={b.letter}
            action={b.action === 'preview' ? PREVIEW_ACTION : undefined}
            plain
            onPress={() => runFromBand($, b.action, settings.mode)}
          />
        ))}
      </Box>
    )

    const hint = leader ? 'letra: aplicar · otra tecla: cancelar' : 'ctrl+x tab: atajos'

    const toolbar = (
      <Box key="toolbar" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button
          key="leader"
          label={leader ? '¶ Formato' : '¶'}
          action={LEADER_ACTION}
          plain
          dimColor={!leader}
          onPress={() => update($, isLeader, v => !v)}
        />
        {group(GROUPS[0] ?? [], 0)}
        <Text dimColor>│</Text>
        {group(GROUPS[1] ?? [], 1)}
        <Text dimColor>│</Text>
        {group(GROUPS[2] ?? [], 2)}
        <Text dimColor>│</Text>
        {group(GROUPS[3] ?? [], 3)}
        <Text dimColor>│</Text>
        {group(GROUPS[4] ?? [], 4)}
        {leader || e.props.bodyColumns >= HINT_COLUMNS ? <Text dimColor>{hint}</Text> : null}
      </Box>
    )

    if (!preview || settings.mode !== 'band') {
      return toolbar
    }

    const text = await read($, draft)

    return (
      <Box flexDirection="column">
        {toolbar}
        <Box key="preview" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          {text.trim() ? (
            <Markdown text={printable(text)} />
          ) : (
            <Text dimColor>Vista previa: escribe en el prompt.</Text>
          )}
        </Box>
      </Box>
    )
  })
}
