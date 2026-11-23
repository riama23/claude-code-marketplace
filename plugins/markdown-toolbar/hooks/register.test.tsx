import type { On, RenderElement, PromptChangeInput, PromptChangeResult, PromptEditInput, PromptEditResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { syncKeybindings } from './keybindings'
import { applyAction, decorate, shiftOffset } from './markdown'
import type { Action, Box } from './markdown'

// Notación: │ es el cursor y ⚓ el ancla.
const parse = (s: string): { box: Box; anchor: number | null } => {
  let text = ''
  let cursor = 0
  let anchor: number | null = null

  for (const ch of s) {
    if (ch === '│') {
      cursor = text.length
    } else if (ch === '⚓') {
      anchor = text.length
    } else {
      text += ch
    }
  }

  return { box: { text, cursor }, anchor }
}

const show = (b: Box) => b.text.slice(0, b.cursor) + '│' + b.text.slice(b.cursor)

const run = (action: Action, input: string) => {
  const { box, anchor } = parse(input)

  return show(applyAction(action, box, anchor))
}

const CASES: [Action, string, string][] = [
  // Negrita: palabra bajo el cursor, rango con ancla, inserción vacía y quitar.
  ['bold', 'hola mun│do', 'hola **mun│do**'],
  ['bold', 'hola │mundo', 'hola **│mundo**'],
  ['bold', 'hola **mun│do**', 'hola mun│do'],
  ['bold', 'hola │', 'hola **│**'],
  ['bold', '**│**', '│'],
  ['bold', '⚓hola mundo│', '**hola mundo**│'],
  ['bold', '│hola mundo⚓', '**│hola mundo**'],
  ['bold', '⚓ hola │', ' **hola** │'],
  ['bold', '**⚓hola│**', 'hola│'],
  ['bold', '⚓**hola**│', 'hola│'],
  ['bold', '**ho│la mundo** y más', 'ho│la mundo y más'],
  ['bold', 'hola ***mun│do***', 'hola *mun│do*'],
  // Justo después de aplicar, el cursor queda en un borde: la misma acción lo deshace.
  ['bold', '**hola**│', 'hola│'],
  ['bold', '│**hola**', '│hola'],
  ['bold', 'ya **hola**│ y', 'ya hola│ y'],
  // Con ancla, el rango no se come los prefijos de línea ni cruza líneas.
  ['bold', '⚓- hola│', '- **hola**│'],
  ['bold', '⚓# Título│', '# **Título**│'],
  ['bold', '⚓- uno\n- dos│', '- **uno**\n- **dos**│'],
  ['bold', '⚓- **uno**\n- **dos**│', '- uno\n- dos│'],
  ['bold', '⚓- **uno**\n- dos│', '- **uno**\n- **dos**│'],
  ['italic', '⚓> uno\n>\n> dos│', '> *uno*\n>\n> *dos*│'],
  // Cursiva, también con _ y combinada con negrita.
  ['italic', 'hola mun│do', 'hola *mun│do*'],
  ['italic', 'hola *mun│do*', 'hola mun│do'],
  ['italic', '_hola│_', 'hola│'],
  ['italic', 'hola **mun│do**', 'hola ***mun│do***'],
  ['italic', 'hola ***mun│do***', 'hola **mun│do**'],
  ['italic', '* item *en│fasis*', '* item en│fasis'],
  ['italic', '*│*', '│'],
  // Tachado y código.
  ['strike', 'a │b', 'a ~~│b~~'],
  ['strike', '~~ta│chado~~', 'ta│chado'],
  ['code', 'usa │npm', 'usa `│npm`'],
  ['code', 'usa `np│m`', 'usa np│m'],
  ['code', '│', '`│`'],
  // Enlace.
  ['link', 'ver │docs', 'ver [docs](│)'],
  ['link', 'ver https://x.dev│', 'ver [│](https://x.dev)'],
  ['link', 'ver [do│cs](https://x.dev) ya', 'ver do│cs ya'],
  ['link', '│', '[│]()'],
  ['link', '⚓hola mundo│', '[hola mundo](│)'],
  ['link', '⚓- docs│', '- [docs](│)'],
  // Listas.
  ['bullet', 'hola│', '- hola│'],
  ['bullet', '- hola│', 'hola│'],
  ['bullet', '* hola│', 'hola│'],
  ['bullet', '1. hola│', '- hola│'],
  ['bullet', '│', '- │'],
  ['bullet', '> cita│', '> - cita│'],
  ['bullet', '⚓- uno\ntres│', '- uno\n- tres│'],
  ['numbered', 'hola│', '1. hola│'],
  ['numbered', '⚓uno\n\ndos│', '1. uno\n\n2. dos│'],
  ['numbered', '⚓1. uno\n2. dos│', 'uno\ndos│'],
  ['numbered', '⚓- uno\n- dos│', '1. uno\n2. dos│'],
  // Cita.
  ['quote', 'hola│', '> hola│'],
  ['quote', '> hola│', 'hola│'],
  ['quote', '⚓uno\n\ndos│', '> uno\n>\n> dos│'],
  // Título: cicla nada → # → ## → ### → nada.
  ['heading', 'tí│tulo', '# tí│tulo'],
  ['heading', '# tí│tulo', '## tí│tulo'],
  ['heading', '## tí│tulo', '### tí│tulo'],
  ['heading', '### tí│tulo', 'tí│tulo'],
  ['heading', 'uno\ndo│s', 'uno\n# do│s'],
  // Bloque de código.
  ['codeblock', '│', '```\n│\n```'],
  ['codeblock', 'const x = 1│', '```\nconst x = 1│\n```'],
  ['codeblock', '⚓uno\ndos│', '```\nuno\ndos│\n```'],
  ['codeblock', '```\nconst x│\n```', 'const x│'],
  ['codeblock', 'antes\n```\nco│de\n```\ndespués', 'antes\nco│de\ndespués'],
  ['codeblock', '```\n│\n```', '│'],
]

for (const [action, input, expected] of CASES) {
  test(`${action}: ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
    expect(run(action, input)).toBe(expected)
  })
}

test('aplicar y quitar deja el texto como estaba', () => {
  for (const action of ['bold', 'italic', 'strike', 'code', 'bullet', 'numbered', 'quote', 'codeblock'] as const) {
    const once = applyAction(action, { text: 'hola mundo', cursor: 7 }, null)
    const twice = applyAction(action, once, null)

    expect(show(twice)).toBe('hola mu│ndo')
  }
})

test('aplicar y quitar con el cursor al final de la palabra, como queda al escribirla', () => {
  for (const action of ['bold', 'italic', 'strike', 'code', 'link'] as const) {
    const once = applyAction(action, { text: 'hola mundo', cursor: 10 }, null)
    const twice = applyAction(action, once, null)

    expect(show(twice)).toBe('hola mundo│')
  }
})

test('el ancla sigue a las ediciones', () => {
  expect(shiftOffset(4, 0, 0, 'X')).toBe(5)
  expect(shiftOffset(4, 3, 4, '')).toBe(3)
  expect(shiftOffset(4, 4, 4, 'X')).toBe(4)
  expect(shiftOffset(4, 6, 6, 'X')).toBe(4)
  expect(shiftOffset(4, 2, 6, '')).toBe(2)
})

test('el resaltado pinta el formato y la selección', () => {
  const marks = decorate('**hola** `x` [a](u)', 0, 4)

  expect(marks).toContainEqual({ start: 2, end: 6, bold: true })
  expect(marks).toContainEqual({ start: 0, end: 2, dimColor: true })
  expect(marks).toContainEqual({ start: 10, end: 11, color: 'permission' })
  expect(marks).toContainEqual({ start: 14, end: 15, underline: true, color: 'suggestion' })
  expect(marks[marks.length - 1]).toEqual({ start: 0, end: 4, backgroundColor: 'suggestion', color: 'inverseText' })
  expect(decorate('# Título', null, 0)).toContainEqual({ start: 2, end: 8, bold: true })
})

// ── Integración con el engine ────────────────────────────────────────────────

const BAND = (props: { hasSurvey?: boolean; isWorking?: boolean } = {}) =>
  ({
    plugin: 'markdown-toolbar',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
      ...props,
    },
  }) as const

type Key = { key: string; ctrl?: true; meta?: true }

/**
 * El engine lanza prompt.edit y prompt.change desde el editor; el kit los ejecuta
 * en `$.prompt`, pero sus tipos solo listan lo que un plugin puede llamar.
 */
type PromptEvents = {
  edit: (e: PromptEditInput) => Promise<PromptEditResult>
  change: (e: PromptChangeInput) => Promise<PromptChangeResult>
}
const editor = ($: Engine) => $.prompt as unknown as PromptEvents

/** Una tecla en el prompt: escribe `key` en el cursor (o lo mueve a `moveTo`). */
const keyEdit = (text: string, cursor: number, key: Key, moveTo?: number) => {
  const isMove = moveTo !== undefined

  return {
    origin: { kind: 'composer' } as const,
    key,
    text,
    cursor,
    start: isMove ? moveTo : cursor,
    end: isMove ? moveTo : cursor,
    inputText: isMove || key.key.length !== 1 ? '' : key.key,
  }
}

/** El editor del engine bajo el mod: aplica el splice y anota cuántas teclas le llegan. */
const engineEditor = (on: On) => {
  const seen: string[] = []
  on('prompt.edit', (_, e) => {
    seen.push(e.inputText)

    return { text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }
  })
  on('prompt.change', (_, e) => ({ text: e.text }))
  on('prompt.paint', () => ({ value: { isPainted: true, text: '', cursor: 0 } }))

  return seen
}

test('sin modo formato, las teclas pasan al editor y se pinta el resultado', async ($, on) => {
  const seen = engineEditor(on)

  const r = await editor($).edit(keyEdit('**hol', 5, { key: 'a' }))

  expect(seen).toEqual(['a'])
  expect(r.text).toBe('**hola')
  const r2 = await editor($).edit(keyEdit('**hola*', 7, { key: '*' }))
  expect(r2.decorations).toContainEqual({ start: 2, end: 6, bold: true })
})

test('Enter, saltos de línea y teclas con Ctrl o Meta no se tocan', async ($, on) => {
  const seen = engineEditor(on)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await editor($).edit({ ...keyEdit('uno', 3, { key: 'return' }), inputText: '\n' })
  await ui.press({ key: 'leader' })
  const r = await editor($).edit({ ...keyEdit('uno', 3, { key: 'b', meta: true }), inputText: '' })

  expect(seen).toEqual(['\n', ''])
  expect(r.text).toBe('uno')
  await ui.unmount()
})

test('modo formato: la letra aplica la acción y se consume', async ($, on) => {
  const seen = engineEditor(on)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'leader' })
  expect((await ui.find({ key: 'leader' }))?.text).toMatch(/Formato/)

  const r = await editor($).edit(keyEdit('hola mundo', 7, { key: 'b' }))

  expect(seen).toEqual([])
  expect(show(r)).toBe('hola **mu│ndo**')
  expect((await ui.find({ key: 'leader' }))?.text).not.toMatch(/Formato/)

  // Fuera del modo, la b se escribe.
  const r2 = await editor($).edit(keyEdit('hola', 4, { key: 'b' }))
  expect(r2.text).toBe('holab')
  await ui.unmount()
})

test('modo formato: otra tecla sale del modo y se escribe', async ($, on) => {
  const seen = engineEditor(on)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'leader' })
  const r = await editor($).edit(keyEdit('hola', 4, { key: 'x' }))

  expect(seen).toEqual(['x'])
  expect(r.text).toBe('holax')
  const r2 = await editor($).edit(keyEdit('holax', 5, { key: 'b' }))
  expect(r2.text).toBe('holaxb')
  await ui.unmount()
})

test('ancla con m: el rango ancla…cursor recibe el formato y el ancla sigue al texto', async ($, on) => {
  engineEditor(on)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'leader' })
  const marked = await editor($).edit(keyEdit('uno dos tres', 4, { key: 'm' }))
  expect(marked.text).toBe('uno dos tres')
  expect(marked.decorations).toContainEqual({ start: 4, end: 4, virtualText: '⚑', color: 'suggestion' })

  // Escribir antes del ancla la desplaza; mover el cursor no.
  await editor($).edit(keyEdit('uno dos tres', 0, { key: 'X' }))
  const moved = await editor($).edit(keyEdit('Xuno dos tres', 1, { key: 'right' }, 8))
  expect(moved.decorations).toContainEqual({ start: 5, end: 8, backgroundColor: 'suggestion', color: 'inverseText' })

  await ui.press({ key: 'leader' })
  const r = await editor($).edit(keyEdit('Xuno dos tres', 8, { key: 'b' }))
  expect(show(r)).toBe('Xuno **dos**│ tres')

  // El ancla se gasta con la acción.
  await ui.press({ key: 'leader' })
  const r2 = await editor($).edit(keyEdit('uno dos tres', 6, { key: 'i' }))
  expect(show(r2)).toBe('uno *do│s* tres')
  await ui.unmount()
})

for (const kind of ['history', 'clear', 'undo', 'engine'] as const) {
  test(`un cambio del prompt de origen ${kind} borra el ancla y el modo formato`, async ($, on) => {
    engineEditor(on)
    const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

    await ui.press({ key: 'leader' })
    await editor($).edit(keyEdit('uno dos tres', 0, { key: 'm' }))
    await ui.press({ key: 'leader' })

    await editor($).change({ text: 'uno dos tres', cursor: 7, origin: { kind } })

    if (kind === 'clear') {
      // El envío vacía el prompt: el modo formato tampoco sobrevive.
      const typed = await editor($).edit(keyEdit('', 0, { key: 'b' }))
      expect(typed.text).toBe('b')
      await ui.press({ key: 'leader' })
    }

    const r = await editor($).edit(keyEdit('uno dos tres', 6, { key: 'b' }))
    // Sin ancla, la b del modo formato pone en negrita solo la palabra bajo el cursor.
    expect(show(r)).toBe('uno **do│s** tres')
    await ui.unmount()
  })
}

test('un fill del propio mod no borra el ancla', async ($, on) => {
  engineEditor(on)
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'leader' })
  await editor($).edit(keyEdit('uno dos tres', 0, { key: 'm' }))
  await editor($).change({ text: 'uno dos tres', cursor: 6, origin: { kind: 'plugin', name: 'markdown-toolbar' } })
  await ui.press({ key: 'leader' })

  const r = await editor($).edit(keyEdit('uno dos tres', 6, { key: 'b' }))
  expect(show(r)).toBe('**uno do**│s tres')
  await ui.unmount()
})

test('los botones de la banda leen el borrador y lo reescriben', async ($, on) => {
  engineEditor(on)
  const fills: { text: string; cursor?: number; mode: string }[] = []
  on('prompt.read', () => ({ value: { text: 'hola mundo', cursor: 7 } }))
  on('prompt.fill', (_, e) => {
    fills.push({ text: e.text, cursor: e.cursor, mode: e.mode })

    return { isFilled: true }
  })

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  await ui.press({ key: 'b' })
  await ui.press({ key: 'k' })
  await ui.press({ key: 'n' })

  expect(fills).toEqual([
    { text: 'hola **mundo**', cursor: 9, mode: 'replace' },
    { text: 'hola [mundo]()', cursor: 13, mode: 'replace' },
    { text: '1. hola mundo', cursor: 10, mode: 'replace' },
  ])
  await ui.unmount()
})

test('el texto enviado es el markdown tal cual', async ($, on) => {
  let sent = ''
  on('prompt.submit', (_, e) => {
    sent = e.text

    return { text: e.text }
  })

  await $.prompt.submit({ text: '**hola** *mundo*\n- uno', wait: false, origin: { kind: 'composer' } })

  expect(sent).toBe('**hola** *mundo*\n- uno')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`en ${surface}: la banda muestra los botones y cede ante una encuesta o un turno`, async ($, on) => {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>engine</Text>
    })

    const ui = await $.ui.mount({ ...BAND(), surface })
    for (const key of ['leader', 'b', 'i', 's', 'c', 'k', 'l', 'n', 'q', 'p', 'h', 'm']) {
      expect(await ui.find({ key })).toBeDefined()
    }
    await ui.unmount()

    for (const props of [{ hasSurvey: true }, { isWorking: true }]) {
      const hidden = await $.ui.mount({ ...BAND(props), surface })
      expect(await hidden.find({ key: 'b' })).toBeUndefined()
      await hidden.unmount()
    }
  })
}

test('la banda de formato se coloca debajo de las demás', async ($, on) => {
  let order: string[] = []
  on('ui.render', { component: 'AbovePromptList' }, ($, e) => {
    order = e.props.rows.map(r => r.plugin)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  const row = (plugin: string) => ({ plugin, tree: h('Text', null, plugin) as RenderElement })
  const ui = await $.ui.mount({
    plugin: 'markdown-toolbar',
    component: 'AbovePromptList',
    surface: 'terminal',
    props: {
      rows: [row('markdown-toolbar'), row('model-switcher')],
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  })

  expect(order).toEqual(['model-switcher', 'markdown-toolbar'])
  await ui.unmount()
})

test('cada botón lleva su letra como hotkey, para usarlos con Ctrl+X Tab sin configurar nada', async ($, on) => {
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  for (const letter of ['b', 'i', 's', 'c', 'k', 'l', 'n', 'q', 'p', 'h', 'm']) {
    expect((await ui.find({ key: letter }))?.props.hotkey).toBe(letter)
  }
  // El ¶ no tiene hotkey: se activa con el atajo opcional (theme:editCustom) o con un clic.
  expect((await ui.find({ key: 'leader' }))?.props.action).toBe('theme:editCustom')
  await ui.unmount()
})

test('la pista de atajo sale solo si cabe, y el modo formato explica qué hacer', async ($, on) => {
  const narrow = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  expect(await narrow.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeUndefined()
  await narrow.press({ key: 'leader' })
  expect(await narrow.find({ type: 'Text', text: /otra tecla: cancelar/ })).toBeDefined()
  await narrow.press({ key: 'leader' })
  await narrow.unmount()

  const wide = await $.ui.mount({ ...BAND(), props: { ...BAND().props, bodyColumns: 140 }, surface: 'terminal' })
  expect(await wide.find({ type: 'Text', text: /ctrl\+x tab: atajos/ })).toBeDefined()
  await wide.unmount()
})

test('con el ancla puesta, el botón m lo indica', async ($, on) => {
  engineEditor(on)
  on('prompt.read', () => ({ value: { text: 'uno dos', cursor: 3 } }))
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  expect((await ui.find({ key: 'm' }))?.props.label).toBe('⚑')
  await ui.press({ key: 'm' })
  expect((await ui.find({ key: 'm' }))?.props.label).toBe('⚑ puesta')
  await ui.press({ key: 'm' })
  expect((await ui.find({ key: 'm' }))?.props.label).toBe('⚑')
  await ui.unmount()
})

// ── Atajos por defecto en keybindings.json ───────────────────────────────────

const WANTED = [
  { action: 'diff:back', chord: 'ctrl+shift+p' },
  { action: 'theme:editCustom', chord: 'meta+e' },
]

test('sin keybindings.json, lo crea con los dos atajos en Global', () => {
  const r = syncKeybindings(undefined, WANTED, {})

  expect(JSON.parse(r.text ?? '')).toEqual({
    $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
    bindings: [{ context: 'Global', bindings: { 'ctrl+shift+p': 'diff:back', 'meta+e': 'theme:editCustom' } }],
  })
  expect(r.managed).toEqual({ 'diff:back': 'ctrl+shift+p', 'theme:editCustom': 'meta+e' })
})

test('respeta lo que ya hay: otros bloques y los atajos de model-switcher', () => {
  const current = JSON.stringify({
    bindings: [
      { context: 'Chat', bindings: { 'ctrl+s': null } },
      { context: 'Global', bindings: { 'meta+m': 'app:cycleDiffBase', 'meta+e': 'theme:editCustom' } },
    ],
  })
  const r = syncKeybindings(current, WANTED, {})
  const file = JSON.parse(r.text ?? '')

  expect(file.bindings[0]).toEqual({ context: 'Chat', bindings: { 'ctrl+s': null } })
  expect(file.bindings[1].bindings).toEqual({
    'meta+m': 'app:cycleDiffBase',
    'meta+e': 'theme:editCustom',
    'ctrl+shift+p': 'diff:back',
  })
})

test('si ya están, no reescribe el archivo', () => {
  const current = JSON.stringify({
    bindings: [{ context: 'Global', bindings: { 'ctrl+shift+p': 'diff:back', 'meta+e': 'theme:editCustom' } }],
  })

  expect(syncKeybindings(current, WANTED, {}).text).toBeNull()
})

test('al cambiar el atajo en /config, quita el que puso antes y pone el nuevo', () => {
  const current = JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'ctrl+shift+p': 'diff:back' } }] })
  const r = syncKeybindings(current, [{ action: 'diff:back', chord: 'Ctrl+Alt+P' }], { 'diff:back': 'ctrl+shift+p' })

  expect(JSON.parse(r.text ?? '').bindings[0].bindings).toEqual({ 'ctrl+alt+p': 'diff:back' })
  expect(r.managed).toEqual({ 'diff:back': 'ctrl+alt+p' })
})

test('un atajo vacío en /config quita el del mod', () => {
  const current = JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'meta+e': 'theme:editCustom', 'meta+m': 'app:cycleDiffBase' } }] })
  const r = syncKeybindings(current, [{ action: 'theme:editCustom', chord: '' }], { 'theme:editCustom': 'meta+e' })

  expect(JSON.parse(r.text ?? '').bindings[0].bindings).toEqual({ 'meta+m': 'app:cycleDiffBase' })
  expect(r.managed).toEqual({})
})

test('nunca pisa un atajo que hace otra cosa, ni borra uno que la persona reasignó', () => {
  const current = JSON.stringify({
    bindings: [{ context: 'Global', bindings: { 'ctrl+shift+p': 'app:toggleTodos', 'meta+e': 'chat:fastMode' } }],
  })
  const r = syncKeybindings(current, WANTED, { 'theme:editCustom': 'meta+e' })

  expect(r.text).toBeNull()
  expect(r.conflicts).toEqual([
    ['ctrl+shift+p', 'app:toggleTodos'],
    ['meta+e', 'chat:fastMode'],
  ])
})

test('un keybindings.json que no es JSON no se toca', () => {
  const r = syncKeybindings('{ "bindings": [ // comentario', WANTED, {})

  expect(r.isInvalid).toBe(true)
  expect(r.text).toBeNull()
})

test('al arrancar, el mod escribe los atajos en ~/.claude/keybindings.json', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/ana' })
  const writes: { path: string; text: string }[] = []
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })

    return { value: undefined }
  })
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(writes.map(w => w.path)).toEqual(['/home/ana/.claude/keybindings.json'])
  expect(JSON.parse(writes[0]?.text ?? '').bindings[0].bindings).toEqual({
    'ctrl+shift+p': 'diff:back',
    'meta+e': 'theme:editCustom',
  })
})

test('si keybindings.json existe pero no se puede leer, no se sobrescribe', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/ana' })
  const writes: string[] = []
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => {
    throw new Error('EACCES')
  })
  on('fs.write', (_, e) => {
    writes.push(e.path)

    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(writes).toEqual([])
})

test('los atajos de /config van a keybindings.json', { options: { previewShortcut: 'ctrl+alt+v', formatShortcut: '' } }, async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/h' })
  let written = ''
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => {
    written = e.text

    return { value: undefined }
  })
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(JSON.parse(written).bindings[0].bindings).toEqual({ 'ctrl+alt+v': 'diff:back' })
})

// ── Vista previa ─────────────────────────────────────────────────────────────

test('v en la banda: muestra la vista previa renderizada debajo y sigue al borrador', async ($, on) => {
  engineEditor(on)
  mock.store(on)
  on('prompt.read', () => ({ value: { text: '**hola**', cursor: 8 } }))

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  expect((await ui.find({ key: 'v' }))?.props.action).toBe('diff:back')

  await ui.press({ key: 'v' })
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('**hola**')
  expect((await ui.find({ key: 'v' }))?.props.label).toBe('Vista ●')

  await editor($).edit(keyEdit('**hola**', 8, { key: '!' }))
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('**hola**!')

  // Queda activa entre mensajes: enviar vacía el prompt, no la apaga.
  await editor($).change({ text: '', cursor: 0, origin: { kind: 'clear' } })
  expect(await ui.find({ type: 'Text', text: /Vista previa: escribe en el prompt/ })).toBeDefined()

  await ui.press({ key: 'v' })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  await ui.unmount()
})

test('el modo formato también alterna la vista previa con v, sin escribir la v', async ($, on) => {
  const seen = engineEditor(on)
  mock.store(on)
  on('prompt.read', () => ({ value: { text: 'hola', cursor: 4 } }))
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'leader' })
  const r = await editor($).edit(keyEdit('hola', 4, { key: 'v' }))

  expect(seen).toEqual([])
  expect(r.text).toBe('hola')
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('hola')
  await ui.unmount()
})

test('la vista previa activa se recuerda entre sesiones', async ($, on) => {
  engineEditor(on)
  mock.store(on, { isPreview: true })
  mock.env(on, { HOME: '/h' })
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  expect((await ui.find({ key: 'v' }))?.props.label).toBe('Vista ●')
  expect(await ui.find({ type: 'Text', text: /Vista previa: escribe en el prompt/ })).toBeDefined()
  await ui.unmount()
})

const PANE_PROPS = {
  plugin: 'markdown-toolbar',
  component: 'Pane',
  requestId: 'markdown-preview',
  props: {
    title: 'Vista previa',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('en modo panel, v abre un panel lateral con la vista previa y la v siguiente lo cierra', { options: { previewMode: 'pane' } }, async ($, on) => {
  engineEditor(on)
  mock.store(on)
  const panes: string[] = []
  on('prompt.read', () => ({ value: { text: '# Título', cursor: 8 } }))
  on('ui.close', (_, e) => {
    panes.push(`close ${e.id}`)

    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    panes.push(`open ${e.id}`)

    return { value: { isPlaced: true } }
  })

  const band = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  await band.press({ key: 'v' })

  expect(panes).toEqual(['open markdown-preview'])
  // En modo panel, la banda no pinta la vista previa.
  expect(await band.find({ type: 'Markdown' })).toBeUndefined()

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE_PROPS, surface })
    expect((await pane.find({ type: 'Markdown' }))?.props.text).toBe('# Título')
    await pane.unmount()
  }

  await band.press({ key: 'v' })
  expect(panes).toEqual(['open markdown-preview', 'close markdown-preview'])
  expect((await band.find({ key: 'v' }))?.props.label).toBe('Vista')
  await band.unmount()
})

test('los chords se comparan sin mayúsculas: no duplica un Meta+E que ya existe', () => {
  const current = JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'Meta+E': 'theme:editCustom' } }] })
  const r = syncKeybindings(current, [{ action: 'theme:editCustom', chord: 'meta+e' }], {})

  expect(r.text).toBeNull()
  expect(r.managed).toEqual({ 'theme:editCustom': 'meta+e' })

  const conflict = syncKeybindings(
    JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'Ctrl+Shift+P': 'app:toggleTodos' } }] }),
    [{ action: 'diff:back', chord: 'ctrl+shift+p' }],
    {},
  )
  expect(conflict.conflicts).toEqual([['ctrl+shift+p', 'app:toggleTodos']])
})

test('con el keybindings.json actual de la persona, solo añade las dos líneas', () => {
  const current = `{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "cmd+m": "app:cycleDiffBase",
        "meta+m": "app:cycleDiffBase"
      }
    }
  ]
}
`
  const r = syncKeybindings(current, WANTED, {})

  expect(r.text).toBe(
    current.replace(
      '"meta+m": "app:cycleDiffBase"\n',
      '"meta+m": "app:cycleDiffBase",\n        "ctrl+shift+p": "diff:back",\n        "meta+e": "theme:editCustom"\n',
    ),
  )
})

test('la vista previa corta un borrador enorme para no pasar del límite de la drawing', async ($, on) => {
  engineEditor(on)
  mock.store(on)
  const huge = 'a'.repeat(50000)
  on('prompt.read', () => ({ value: { text: huge, cursor: 0 } }))
  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  await ui.press({ key: 'v' })
  const text = String((await ui.find({ type: 'Markdown' }))?.props.text)

  expect(text.length).toBeLessThan(20010)
  expect(text.endsWith('…')).toBe(true)
  await ui.unmount()
})
