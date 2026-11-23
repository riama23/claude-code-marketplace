import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

/** Se usa si la fila Model de /config no trae opciones. */
export const FALLBACK_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const

const current = atom({ plugin: 'model-switcher', key: 'current' } as const, null)

/** "sonnet[1m]" → "Sonnet 1M", "opusplan" → "Opusplan". */
export const labelOf = (alias: string): string => {
  const name = alias.replace(/\[1m\]$/i, '')
  const pretty = name.charAt(0).toUpperCase() + name.slice(1)

  return name === alias ? pretty : `${pretty} 1M`
}

/** Lista de alias que acepta /model y el alias activo según /config. */
const readModels = async ($: EngineInterface) => {
  const row = (await $.config.list()).find(r => r.key === 'model')
  const models = row?.options?.length ? [...row.options] : [...FALLBACK_MODELS]
  const fromConfig = typeof row?.value === 'string' ? row.value : null

  return { models, fromConfig }
}

const switchTo = async ($: EngineInterface, alias: string) => {
  try {
    await $.command.run({ command: 'model', args: alias })
    await update($, current, () => alias)
  } catch (err) {
    $.ui.toast(`No se pudo cambiar a ${labelOf(alias)}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const register: Register = on => {
  // Un cambio hecho fuera del mod (/model, /config) mueve el resaltado.
  on('classic.PostModelSwitch', async ($, e, next) => {
    // Solo refresca el resaltado: un fallo aquí no debe frenar el cambio de modelo.
    await update($, current, () => e.requested_model ?? 'default').catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const { models, fromConfig } = await readModels($)
    const active = (await read($, current)) ?? fromConfig

    if (e.props.isWorking) {
      return (
        <Box>
          <Text dimColor>
            Modelo: {active ? labelOf(active) : '—'} (cambiar al terminar el turno)
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text dimColor>Modelo: </Text>
        {models.map((alias, i) => (
          <Button
            key={alias}
            label={labelOf(alias)}
            hotkey={i < 9 ? String(i + 1) : undefined}
            variant={alias === active ? 'primary' : undefined}
            dimColor={alias !== active}
            onPress={() => (alias === active ? undefined : switchTo($, alias))}
          />
        ))}
      </Box>
    )
  })
}
