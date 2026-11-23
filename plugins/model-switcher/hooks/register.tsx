import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from '../types'

/** Familias que muestra el panel, en este orden. */
export const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const
export type Family = (typeof FAMILIES)[number]

export const EFFORTS = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const

const current = atom({ plugin: 'model-switcher', key: 'current' } as const, null)
const effort = atom({ plugin: 'model-switcher', key: 'effort' } as const, null)
const fast = atom({ plugin: 'model-switcher', key: 'fast' } as const, null)
const isOpen = atom({ plugin: 'model-switcher', key: 'isOpen' } as const, false)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "opus" → "Opus", "xhigh" → "XHigh". */
export const effortLabel = (level: Effort): string => (level === 'xhigh' ? 'XHigh' : capitalize(level))

/** Familia y variante 1M a partir de un alias ("opus[1m]") o de lo que muestra /model ("Opus 5.5 (1M context)"). */
export const parseModel = (model: string): { family: Family | null; is1M: boolean } => {
  const lower = model.toLowerCase()

  return {
    family: FAMILIES.find(f => lower.includes(f)) ?? null,
    is1M: /\[1m\]|\b1m\b/.test(lower),
  }
}

const aliasOf = (family: Family, is1M: boolean) => (is1M ? `${family}[1m]` : family)

const isEffort = (v: unknown): v is Effort => typeof v === 'string' && (EFFORTS as readonly string[]).includes(v)

/** Alias que admite /config y el modelo activo de la sesión. */
const readModel = async ($: EngineInterface) => {
  const row = (await $.config.list()).find(r => r.key === 'model')
  const options = new Set(row?.options ?? [])
  const fromConfig = typeof row?.value === 'string' ? row.value : null
  const remembered = await read($, current)
  let active = parseModel(remembered ?? fromConfig ?? '')

  if (!active.family) {
    // "default" u otro alias sin familia: pregunta a la sesión qué modelo corre.
    active = parseModel(await $.session.model().catch(() => ''))
  }

  return { options, active }
}

/** Effort y fast mode: lo último que puso el mod, si no lo que digan los settings. */
const readTuning = async ($: EngineInterface) => {
  const remembered = await read($, effort)
  const level =
    remembered ?? (await $.settings.read({ key: 'effortLevel' }).then(v => (isEffort(v) ? v : null), () => null))
  const rememberedFast = await read($, fast)
  const isFast =
    rememberedFast ?? (await $.settings.read({ key: 'fastMode' }).then(v => v === true, () => false))

  return { level: level ?? 'auto', isFast }
}

const run = async ($: EngineInterface, command: string, args: string, what: string, after: () => Promise<unknown>) => {
  try {
    await $.command.run({ command, args })
    await after()
  } catch (err) {
    $.ui.toast(`No se pudo cambiar ${what}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const switchModel = ($: EngineInterface, alias: string) =>
  run($, 'model', alias, `a ${capitalize(alias.replace('[1m]', ' 1M'))}`, () => update($, current, () => alias))

const switchEffort = ($: EngineInterface, level: Effort) =>
  run($, 'effort', level, `el effort a ${effortLabel(level)}`, () => update($, effort, () => level))

const switchFast = ($: EngineInterface, on: boolean) =>
  run($, 'fast', on ? 'on' : 'off', 'el fast mode', () => update($, fast, () => on))

export const register: Register = on => {
  // Un cambio hecho fuera del mod (/model, /config, /fast) mueve el resaltado.
  on('classic.PostModelSwitch', async ($, e, next) => {
    // Solo refresca el resaltado: un fallo aquí no debe frenar el cambio de modelo.
    await update($, current, () => e.requested_model ?? e.to_model ?? null).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const { options, active } = await readModel($)
    const { level, isFast } = await readTuning($)
    const open = !e.props.isWorking && (await read($, isOpen))

    const modelName = active.family ? `${capitalize(active.family)}${active.is1M ? ' 1M' : ''}` : '—'
    const summary = `${modelName} · ${effortLabel(level)} · Fast ${isFast ? 'on' : 'off'}`

    if (e.props.isWorking) {
      return (
        <Box>
          <Text dimColor>{summary}</Text>
        </Box>
      )
    }

    // Sin hotkey: un dígito suelto competía con lo que se escribe en el prompt.
    // Un mod no puede declarar acciones propias, así que se usa app:cycleDiffBase
    // (su handler solo existe dentro del panel de diff); la persona le asigna el
    // atajo en ~/.claude/keybindings.json, p. ej. "cmd+m" en el contexto Global.
    const toggle = (
      <Button
        key="toggle"
        label={`${summary} ${open ? '▾' : '▸'}`}
        action="app:cycleDiffBase"
        plain
        dimColor={!open}
        onPress={() => update($, isOpen, v => !v)}
      />
    )

    if (!open) {
      return <Box>{toggle}</Box>
    }

    const has1M = active.family !== null && options.has(aliasOf(active.family, true))

    return (
      <Box flexDirection="column">
        {toggle}
        <Box flexDirection="row" flexWrap="wrap">
          <Text dimColor>Modelo  </Text>
          {FAMILIES.map((family, i) => {
            const isActive = family === active.family

            return (
              <Button
                key={family}
                label={capitalize(family)}
                hotkey={String(i + 1)}
                variant={isActive ? 'primary' : undefined}
                dimColor={!isActive}
                // Al cambiar de familia se conserva 1M si la nueva también lo tiene.
                onPress={() =>
                  isActive
                    ? undefined
                    : switchModel($, aliasOf(family, active.is1M && options.has(aliasOf(family, true))))
                }
              />
            )
          })}
          {has1M && active.family ? (
            <Button
              key="1m"
              label="1M"
              hotkey="5"
              variant={active.is1M ? 'primary' : undefined}
              dimColor={!active.is1M}
              onPress={() => switchModel($, aliasOf(active.family as Family, !active.is1M))}
            />
          ) : null}
        </Box>
        <Box flexDirection="row" flexWrap="wrap">
          <Text dimColor>Effort  </Text>
          {EFFORTS.map(l => (
            <Button
              key={`effort-${l}`}
              label={effortLabel(l)}
              variant={l === level ? 'primary' : undefined}
              dimColor={l !== level}
              onPress={() => (l === level ? undefined : switchEffort($, l))}
            />
          ))}
        </Box>
        <Box flexDirection="row">
          <Text dimColor>Fast    </Text>
          <Button
            key="fast"
            label={isFast ? 'On' : 'Off'}
            variant={isFast ? 'primary' : undefined}
            dimColor={!isFast}
            onPress={() => switchFast($, !isFast)}
          />
        </Box>
      </Box>
    )
  })
}
