import { expect, test } from 'claude-code/testing'

const BAND = (props: { hasSurvey?: boolean; isWorking?: boolean } = {}) =>
  ({
    plugin: 'model-switcher',
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

const MODEL_ROW = {
  key: 'model',
  label: 'Model',
  kind: 'choice',
  value: 'opus',
  options: ['default', 'sonnet', 'opus', 'haiku', 'sonnet[1m]'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`lista los modelos de /config y cambia con /model (${surface})`, async ($, on) => {
    const runs: unknown[] = []
    on('config.list', () => ({ value: [MODEL_ROW] }))
    on('command.run', (_, e) => {
      runs.push({ command: e.command, args: e.args })

      return { text: 'Set model' }
    })

    const ui = await $.ui.mount({ ...BAND(), surface })

    expect((await ui.find({ key: 'sonnet[1m]' }))?.text).toMatch(/Sonnet 1M/)
    await ui.press({ key: 'haiku' })
    expect(runs).toEqual([{ command: 'model', args: 'haiku' }])
    await ui.unmount()
  })
}

test('usa la lista fija si /config no trae opciones', async ($, on) => {
  on('config.list', () => ({ value: [] }))

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })

  for (const key of ['opus', 'sonnet', 'haiku', 'fable']) {
    expect(await ui.find({ key })).toBeDefined()
  }
  await ui.unmount()
})

test('cede la band a una encuesta', async ($, on) => {
  on('config.list', () => ({ value: [MODEL_ROW] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND({ hasSurvey: true }), surface: 'terminal' })

  expect(await ui.find({ key: 'opus' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('sin botones mientras Claude trabaja', async ($, on) => {
  on('config.list', () => ({ value: [MODEL_ROW] }))

  const ui = await $.ui.mount({ ...BAND({ isWorking: true }), surface: 'terminal' })

  expect(await ui.find({ key: 'sonnet' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /Modelo: Opus/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('un fallo de /model se avisa con un toast', async ($, on) => {
  const toasts: string[] = []
  on('config.list', () => ({ value: [MODEL_ROW] }))
  on('command.run', () => {
    throw new Error('ocupado')
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  await ui.press({ key: 'sonnet' })

  expect(toasts[0]).toMatch(/No se pudo cambiar a Sonnet/)
  await ui.unmount()
})
