import type { PromptDecoration } from 'claude-code'

/** El borrador del prompt: texto y posición del cursor (offsets UTF-16). */
export type Box = { text: string; cursor: number }

export type Action =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'codeblock'
  | 'heading'

/** Lo que hace una letra o un botón: una acción de formato, el ancla o la vista previa. */
export type Command = Action | 'anchor' | 'preview'

/** Letra del modo formato → comando. `m` fija o quita el ancla, `v` alterna la vista previa. */
export const KEYS: Record<string, Command> = {
  b: 'bold',
  i: 'italic',
  s: 'strike',
  c: 'code',
  k: 'link',
  l: 'bullet',
  n: 'numbered',
  q: 'quote',
  p: 'codeblock',
  h: 'heading',
  m: 'anchor',
  v: 'preview',
}

// ── Ediciones ────────────────────────────────────────────────────────────────

type Edit = { at: number; del: number; ins: string }

/** Aplica ediciones que no se solapan (en cualquier orden) y mueve el cursor con ellas. */
const applyEdits = (text: string, cursor: number, edits: Edit[]): Box => {
  let out = text
  let c = cursor

  for (const { at, del, ins } of [...edits].sort((a, b) => b.at - a.at)) {
    out = out.slice(0, at) + ins + out.slice(at + del)

    if (c >= at + del) {
      c += ins.length - del
    } else if (c > at) {
      c = at
    }
  }

  return { text: out, cursor: c }
}

/** Mueve un offset guardado (el ancla) a través de una edición `[start, end) → inputText`. */
export const shiftOffset = (offset: number, start: number, end: number, inputText: string): number => {
  if (offset > start && offset >= end) {
    return offset + inputText.length - (end - start)
  }

  return offset > start ? start : offset
}

// ── Utilidades de texto ──────────────────────────────────────────────────────

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}_'’-]/u.test(ch)
const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch)

const lineStart = (text: string, i: number) => text.lastIndexOf('\n', i - 1) + 1

const lineEnd = (text: string, i: number) => {
  const nl = text.indexOf('\n', i)

  return nl === -1 ? text.length : nl
}

type Line = { start: number; end: number; text: string }

const lineAt = (text: string, i: number): Line => {
  const start = lineStart(text, i)
  const end = lineEnd(text, i)

  return { start, end, text: text.slice(start, end) }
}

/** Las líneas que toca `[from, to]`. Un rango que acaba justo al inicio de una línea no la incluye. */
const linesIn = (text: string, from: number, to: number): Line[] => {
  const first = lineStart(text, from)
  let lastStart = lineStart(text, to)

  if (to > from && to === lastStart && lastStart > first) {
    lastStart = lineStart(text, lastStart - 1)
  }

  const lines: Line[] = []
  let start = first

  for (;;) {
    const line = lineAt(text, start)
    lines.push(line)

    if (start >= lastStart || line.end >= text.length) {
      return lines
    }

    start = line.end + 1
  }
}

const wordAt = (text: string, c: number): [number, number] | null => {
  let s = c
  let e = c

  while (isWordChar(text[s - 1])) s--
  while (isWordChar(text[e])) e++

  return s < e ? [s, e] : null
}

const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i

/** El token sin espacios bajo el cursor, si es una URL. */
const urlAt = (text: string, c: number): [number, number] | null => {
  let s = c
  let e = c

  while (!isSpace(text[s - 1])) s--
  while (!isSpace(text[e])) e++

  return s < e && URL_RE.test(text.slice(s, e)) ? [s, e] : null
}

const runEndingAt = (text: string, i: number, ch: string, min = 0) => {
  let n = 0

  while (i - n - 1 >= min && text[i - n - 1] === ch) n++

  return n
}

const runStartingAt = (text: string, i: number, ch: string, max = text.length) => {
  let n = 0

  while (i + n < max && text[i + n] === ch) n++

  return n
}

const sorted = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a])

/** Recorta espacios a ambos lados de `[s, e)`: `** x**` no es markdown válido. */
const trimRange = (text: string, s: number, e: number): [number, number] => {
  while (s < e && isSpace(text[s])) s++
  while (e > s && isSpace(text[e - 1])) e--

  return [s, e]
}

// ── Inline: negrita, cursiva, tachado, código ────────────────────────────────

type InlineSpec = {
  /** Caracteres que reconoce al quitar; el primero es el que inserta. */
  chars: string[]
  insert: string
  /** Cuántos caracteres de marcador quitar de cada lado, dado el menor de los dos tramos (0: no aplica). */
  remove: (n: number) => number
}

const INLINE: Record<'bold' | 'italic' | 'strike' | 'code', InlineSpec> = {
  bold: { chars: ['*'], insert: '**', remove: n => (n >= 2 ? 2 : 0) },
  // `***x***` es negrita y cursiva: un tramo impar contiene una cursiva.
  italic: { chars: ['*', '_'], insert: '*', remove: n => (n % 2 === 1 ? 1 : 0) },
  strike: { chars: ['~'], insert: '~~', remove: n => (n >= 2 ? 2 : 0) },
  code: { chars: ['`'], insert: '`', remove: n => n },
}

type Run = { start: number; end: number }

/** Tramos de `ch` en la línea que pueden ser marcadores (no viñetas ni un `*` suelto entre espacios). */
const markerRuns = (text: string, line: Line, ch: string): Run[] => {
  const runs: Run[] = []
  let i = line.start

  while (i < line.end) {
    if (text[i] !== ch) {
      i++
      continue
    }

    const start = i

    while (i < line.end && text[i] === ch) i++

    const isLoose = isSpace(text[start - 1]) && isSpace(text[i])

    if (!isLoose) {
      runs.push({ start, end: i })
    }
  }

  return runs
}

/** Las ediciones que quitan el formato de `[s, e)` si ya lo tiene, o null. */
const removalEdits = (text: string, s: number, e: number, spec: InlineSpec): Edit[] | null => {
  for (const ch of spec.chars) {
    // Marcadores justo fuera del rango: **[hola]**
    const outside = spec.remove(Math.min(runEndingAt(text, s, ch), runStartingAt(text, e, ch)))

    if (outside) {
      return [
        { at: s - outside, del: outside, ins: '' },
        { at: e, del: outside, ins: '' },
      ]
    }

    // Marcadores dentro del rango: [**hola**]
    const left = runStartingAt(text, s, ch, e)
    const right = runEndingAt(text, e, ch, s)
    const inside = spec.remove(Math.min(left, right))

    if (inside && s + inside <= e - inside && left < e - s) {
      return [
        { at: s, del: inside, ins: '' },
        { at: e - inside, del: inside, ins: '' },
      ]
    }
  }

  return null
}

const addEdits = (s: number, e: number, spec: InlineSpec): Edit[] => [
  { at: s, del: 0, ins: spec.insert },
  { at: e, del: 0, ins: spec.insert },
]

const toggleInlineRange = (box: Box, s: number, e: number, spec: InlineSpec): Box =>
  applyEdits(box.text, box.cursor, removalEdits(box.text, s, e, spec) ?? addEdits(s, e, spec))

/** Dónde empieza el contenido de la línea: tras sangría, `>`, viñeta, número o `#`. */
const contentStart = (line: Line) => {
  const container = (CONTAINER_RE.exec(line.text) ?? [''])[0]
  const rest = line.text.slice(container.length)
  const prefix = LIST_RE.exec(rest) ?? HEADING_RE.exec(rest)

  return line.start + container.length + (prefix ? prefix[0].length : 0)
}

/**
 * El rango `[a, b)` partido por líneas, sin los prefijos de línea ni los espacios
 * de los bordes: `**- hola**` o `**uno\ndos**` no serían markdown válido.
 */
const segments = (text: string, a: number, b: number): [number, number][] =>
  linesIn(text, a, b)
    .map(l => trimRange(text, Math.max(a, contentStart(l)), Math.min(b, l.end)))
    .filter(([s, e]) => s < e)

const insertPair = (box: Box, open: string, close: string): Box => ({
  text: box.text.slice(0, box.cursor) + open + close + box.text.slice(box.cursor),
  cursor: box.cursor + open.length,
})

const toggleInline = (box: Box, anchor: number | null, spec: InlineSpec): Box => {
  const { text, cursor } = box

  if (anchor !== null) {
    const segs = segments(text, ...sorted(anchor, cursor))

    if (segs.length <= 1) {
      const [s, e] = segs[0] ?? [cursor, cursor]

      return s < e ? toggleInlineRange(box, s, e, spec) : insertPair(box, spec.insert, spec.insert)
    }

    // Varias líneas: si todas tienen ya el formato se quita; si no, se pone donde falte.
    const removals = segs.map(([s, e]) => removalEdits(text, s, e, spec))
    const edits = removals.every(r => r !== null)
      ? removals.flatMap(r => r ?? [])
      : segs.flatMap(([s, e], i) => (removals[i] ? [] : addEdits(s, e, spec)))

    return applyEdits(text, cursor, edits)
  }

  const line = lineAt(text, cursor)

  for (const ch of spec.chars) {
    // El cursor entre dos marcadores vacíos: **│**
    const empty = spec.remove(Math.min(runEndingAt(text, cursor, ch, line.start), runStartingAt(text, cursor, ch, line.end)))

    if (empty) {
      return applyEdits(text, cursor, [{ at: cursor - empty, del: empty * 2, ins: '' }])
    }

    // El cursor dentro de un tramo con formato o en sus bordes: **ho│la mundo**, **hola**│
    const runs = markerRuns(text, line, ch)

    for (let i = 0; i + 1 < runs.length; i += 2) {
      const open = runs[i] as Run
      const close = runs[i + 1] as Run

      if (open.start <= cursor && cursor <= close.end) {
        const n = spec.remove(Math.min(open.end - open.start, close.end - close.start))

        if (n) {
          return applyEdits(text, cursor, [
            { at: open.end - n, del: n, ins: '' },
            { at: close.start, del: n, ins: '' },
          ])
        }
      }
    }
  }

  const word = wordAt(text, cursor)

  return word ? toggleInlineRange(box, word[0], word[1], spec) : insertPair(box, spec.insert, spec.insert)
}

// ── Enlace ───────────────────────────────────────────────────────────────────

const LINK_RE = /\[([^\]\n]*)\]\(([^)\n]*)\)/g

const toggleLink = (box: Box, anchor: number | null): Box => {
  const { text, cursor } = box
  let range: [number, number] | null

  if (anchor !== null) {
    // Un enlace no cruza líneas: se queda con la primera.
    range = segments(text, ...sorted(anchor, cursor))[0] ?? null
  } else {
    const line = lineAt(text, cursor)

    for (const m of line.text.matchAll(LINK_RE)) {
      const start = line.start + (m.index ?? 0)
      const end = start + m[0].length

      if (start < cursor && cursor < end) {
        const label = m[1] ?? ''

        // [texto](url) → texto
        return applyEdits(text, cursor, [
          { at: start, del: 1, ins: '' },
          { at: start + 1 + label.length, del: end - (start + 1 + label.length), ins: '' },
        ])
      }
    }

    range = urlAt(text, cursor) ?? wordAt(text, cursor)
  }

  if (!range || range[0] === range[1]) {
    return insertPair(box, '[', ']()')
  }

  const [s, e] = range
  const selected = text.slice(s, e)

  if (URL_RE.test(selected)) {
    // url → [│](url)
    return { text: `${text.slice(0, s)}[](${selected})${text.slice(e)}`, cursor: s + 1 }
  }

  // texto → [texto](│)
  return { text: `${text.slice(0, s)}[${selected}]()${text.slice(e)}`, cursor: e + 3 }
}

// ── Líneas: lista, numerada, cita ────────────────────────────────────────────

/** Sangría y `>` de cita al principio de la línea: lo que va antes de una lista. */
const CONTAINER_RE = /^[ \t]*(?:>[ \t]?)*[ \t]*/
const LIST_RE = /^(?:([-*+])|(\d+)[.)])(?: |$)/

type ListInfo = { at: number; length: number; kind: 'bullet' | 'numbered' } | null

const listOf = (line: Line): ListInfo => {
  const container = (CONTAINER_RE.exec(line.text) ?? [''])[0]
  const m = LIST_RE.exec(line.text.slice(container.length))

  if (!m) {
    return null
  }

  return { at: line.start + container.length, length: m[0].length, kind: m[1] ? 'bullet' : 'numbered' }
}

const containerEnd = (line: Line) => line.start + (CONTAINER_RE.exec(line.text) ?? [''])[0].length

const blockLines = (box: Box, anchor: number | null): Line[] =>
  anchor === null ? [lineAt(box.text, box.cursor)] : linesIn(box.text, ...sorted(anchor, box.cursor))

const toggleList = (box: Box, anchor: number | null, kind: 'bullet' | 'numbered'): Box => {
  const lines = blockLines(box, anchor)
  const nonBlank = lines.filter(l => l.text.trim() !== '')
  const targets = lines.length > 1 && nonBlank.length > 0 ? nonBlank : lines

  if (targets.every(l => listOf(l)?.kind === kind)) {
    return applyEdits(
      box.text,
      box.cursor,
      targets.map(l => {
        const list = listOf(l) as NonNullable<ListInfo>

        return { at: list.at, del: list.length, ins: '' }
      }),
    )
  }

  const edits = targets.map((l, i): Edit => {
    const marker = kind === 'bullet' ? '- ' : `${i + 1}. `
    const list = listOf(l)

    if (list?.kind === 'bullet' && kind === 'bullet') {
      return { at: list.at, del: 0, ins: '' }
    }

    return list ? { at: list.at, del: list.length, ins: marker } : { at: containerEnd(l), del: 0, ins: marker }
  })

  return applyEdits(box.text, box.cursor, edits)
}

const QUOTE_RE = /^([ \t]*)>[ ]?/

const toggleQuote = (box: Box, anchor: number | null): Box => {
  const lines = blockLines(box, anchor)

  if (lines.every(l => QUOTE_RE.test(l.text))) {
    return applyEdits(
      box.text,
      box.cursor,
      lines.map(l => {
        const m = QUOTE_RE.exec(l.text) as RegExpExecArray

        return { at: l.start + (m[1]?.length ?? 0), del: m[0].length - (m[1]?.length ?? 0), ins: '' }
      }),
    )
  }

  const isMulti = lines.length > 1

  return applyEdits(
    box.text,
    box.cursor,
    lines
      .filter(l => !QUOTE_RE.test(l.text))
      // Una línea vacía dentro de una cita lleva `>` sin espacio, para no cortarla.
      .map(l => ({ at: l.start, del: 0, ins: isMulti && l.text.trim() === '' ? '>' : '> ' })),
  )
}

// ── Título ───────────────────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})(?:[ \t]+|$)/

const cycleHeading = (box: Box): Box => {
  const line = lineAt(box.text, box.cursor)
  const m = HEADING_RE.exec(line.text)
  const level = m ? (m[1] as string).length : 0
  const next = level === 0 ? 1 : level >= 3 ? 0 : level + 1

  return applyEdits(box.text, box.cursor, [
    { at: line.start, del: m ? m[0].length : 0, ins: next ? `${'#'.repeat(next)} ` : '' },
  ])
}

// ── Bloque de código ─────────────────────────────────────────────────────────

const FENCE_RE = /^[ \t]*```/

const allLines = (text: string): Line[] => {
  const lines: Line[] = []
  let start = 0

  for (const part of text.split('\n')) {
    lines.push({ start, end: start + part.length, text: part })
    start += part.length + 1
  }

  return lines
}

/** Rango que borra una línea entera con su salto: el de después, o el de antes si es la última. */
const lineSpan = (text: string, l: Line): [number, number] =>
  l.end < text.length ? [l.start, l.end + 1] : [Math.max(0, l.start - 1), l.end]

const toggleCodeBlock = (box: Box, anchor: number | null): Box => {
  const { text, cursor } = box
  const lines = allLines(text)
  const fences = lines.map((l, i) => (FENCE_RE.test(l.text) ? i : -1)).filter(i => i >= 0)
  const here = lines.findIndex(l => l.start <= cursor && cursor <= l.end)

  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i] as number
    const close = fences[i + 1] as number

    if (open <= here && here <= close) {
      const a = lineSpan(text, lines[open] as Line)
      const b = lineSpan(text, lines[close] as Line)

      if (a[1] >= b[0]) {
        // Bloque vacío: las dos líneas se borran de una vez.
        return applyEdits(text, cursor, [{ at: a[0], del: b[1] - a[0], ins: '' }])
      }

      return applyEdits(text, cursor, [
        { at: a[0], del: a[1] - a[0], ins: '' },
        { at: b[0], del: b[1] - b[0], ins: '' },
      ])
    }
  }

  const block = blockLines(box, anchor)
  const first = block[0] as Line
  const last = block[block.length - 1] as Line

  if (anchor === null && first.text.trim() === '') {
    return {
      text: `${text.slice(0, first.start)}\`\`\`\n\n\`\`\`${text.slice(first.end)}`,
      cursor: first.start + 4,
    }
  }

  return {
    text: `${text.slice(0, first.start)}\`\`\`\n${text.slice(first.start, last.end)}\n\`\`\`${text.slice(last.end)}`,
    cursor: cursor + 4,
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/**
 * Aplica o quita `action` sobre el borrador. `anchor` es el otro extremo de la
 * selección (null o igual al cursor: sin selección).
 */
export const applyAction = (action: Action, box: Box, anchor: number | null): Box => {
  const a = anchor === null || anchor === box.cursor || anchor > box.text.length ? null : anchor

  switch (action) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return toggleInline(box, a, INLINE[action])
    case 'link':
      return toggleLink(box, a)
    case 'bullet':
    case 'numbered':
      return toggleList(box, a, action)
    case 'quote':
      return toggleQuote(box, a)
    case 'heading':
      return cycleHeading(box)
    case 'codeblock':
      return toggleCodeBlock(box, a)
  }
}

// ── Resaltado ────────────────────────────────────────────────────────────────

const CODE_COLOR = 'permission'
const LINK_COLOR = 'suggestion'
const MARK_COLOR = 'claude'

/** Sustituye `[s, e)` por `\0` para que las reglas siguientes no lo vuelvan a leer. */
const mask = (s: string, start: number, end: number) => s.slice(0, start) + '\0'.repeat(end - start) + s.slice(end)

const decorateInline = (line: string, offset: number, out: PromptDecoration[]) => {
  let m = line
  const at = (i: number) => offset + i

  for (const x of line.matchAll(/(`+)(.+?)\1(?!`)/g)) {
    const i = x.index ?? 0
    const n = (x[1] as string).length
    out.push({ start: at(i), end: at(i + n), dimColor: true })
    out.push({ start: at(i + n), end: at(i + x[0].length - n), color: CODE_COLOR })
    out.push({ start: at(i + x[0].length - n), end: at(i + x[0].length), dimColor: true })
    m = mask(m, i, i + x[0].length)
  }

  for (const x of m.matchAll(LINK_RE)) {
    const i = x.index ?? 0
    const label = (x[1] as string).length
    out.push({ start: at(i), end: at(i + 1), dimColor: true })
    out.push({ start: at(i + 1), end: at(i + 1 + label), underline: true, color: LINK_COLOR })
    out.push({ start: at(i + 1 + label), end: at(i + x[0].length), dimColor: true })
    m = mask(m, i, i + 1)
    m = mask(m, i + 1 + label, i + x[0].length)
  }

  const pairs: [RegExp, number, Omit<PromptDecoration, 'start' | 'end'>][] = [
    [/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, 2, { bold: true }],
    [/~~(?=\S)(.+?)(?<=\S)~~/g, 2, { strikethrough: true }],
    [/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, 1, { italic: true }],
    [/(?<![_\w])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![_\w])/g, 1, { italic: true }],
  ]

  for (const [re, n, style] of pairs) {
    for (const x of m.matchAll(re)) {
      const i = x.index ?? 0
      const end = i + x[0].length
      out.push({ start: at(i), end: at(i + n), dimColor: true })
      out.push({ start: at(i + n), end: at(end - n), ...style })
      out.push({ start: at(end - n), end: at(end), dimColor: true })
      m = mask(m, i, i + n)
      m = mask(m, end - n, end)
    }
  }
}

/** Decoraciones del borrador: formato markdown en vivo y, si hay ancla, la selección. */
export const decorate = (text: string, anchor: number | null, cursor: number): PromptDecoration[] => {
  const out: PromptDecoration[] = []
  let isInFence = false

  for (const line of allLines(text)) {
    const { start, end } = line

    if (FENCE_RE.test(line.text)) {
      out.push({ start, end, color: CODE_COLOR, dimColor: true })
      isInFence = !isInFence
      continue
    }

    if (isInFence) {
      out.push({ start, end, color: CODE_COLOR })
      continue
    }

    const container = (CONTAINER_RE.exec(line.text) ?? [''])[0]
    let body = start + container.length

    if (container.includes('>')) {
      out.push({ start, end: body, color: MARK_COLOR })
    }

    const rest = line.text.slice(container.length)
    const list = LIST_RE.exec(rest)
    const heading = HEADING_RE.exec(rest)

    if (list) {
      out.push({ start: body, end: body + list[0].length, color: MARK_COLOR, bold: true })
      body += list[0].length
    } else if (heading) {
      out.push({ start: body, end: body + heading[0].length, dimColor: true })
      body += heading[0].length
      out.push({ start: body, end, bold: true })
    }

    decorateInline(text.slice(body, end), body, out)
  }

  if (anchor !== null && anchor <= text.length) {
    const [s, e] = sorted(anchor, cursor)

    out.push(
      s < e
        ? { start: s, end: e, backgroundColor: LINK_COLOR, color: 'inverseText' }
        : { start: s, end: s, virtualText: '⚑', color: LINK_COLOR },
    )
  }

  return out.filter(d => d.end > d.start || d.virtualText !== undefined)
}
