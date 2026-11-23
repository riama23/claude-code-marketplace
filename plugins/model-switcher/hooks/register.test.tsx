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
  options: ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`plegado muestra solo el resumen y se despliega (${surface})`, async ($, on) => {
    on('config.list', () => ({ value: [MODEL_ROW] }))

    const ui = await $.ui.mount({ ...BAND(), surface })

    const toggle = await ui.find({ key: 'toggle' })
    expect(toggle?.text).toMatch(/Opus · Auto · Fast off/)
    // Se despliega con el atajo de la acción (Cmd+M en keybindings.json), no con un dígito.
    expect(toggle?.props.action).toBe('app:cycleDiffBase')
    expect(toggle?.props.hotkey).toBeUndefined()
    expect(await ui.find({ key: 'sonnet' })).toBeUndefined()

    await ui.press({ key: 'toggle' })
    for (const key of ['opus', 'sonnet', 'haiku', 'fable', '1m', 'effort-medium', 'fast']) {
      expect(await ui.find({ key })).toBeDefined()
    }
    for (const key of ['default', 'best', 'opusplan', 'sonnet[1m]']) {
      expect(await ui.find({ key })).toBeUndefined()
    }

    await ui.press({ key: 'toggle' })
    expect(await ui.find({ key: 'sonnet' })).toBeUndefined()
    await ui.unmount()
  })
}

test('cambia modelo, 1M, effort y fast con sus comandos', async ($, on) => {
  const runs: unknown[] = []
  on('config.list', () => ({ value: [MODEL_ROW] }))
  on('command.run', (_, e) => {
    runs.push({ command: e.command, args: e.args })

    return { text: 'ok' }
  })

  const ui = await $.ui.mount({ ...BAND(), surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  await ui.press({ key: '1m' })
  await ui.press({ key: 'sonnet' })
  await ui.press({ key: 'haiku' })
  await ui.press({ key: 'effort-high' })
  await ui.press({ key: 'fast' })

  expect(runs).toEqual([
    { command: 'model', args: 'opus[1m]' },
    { command: 'model', args: 'sonnet[1m]' },
    { command: 'model', args: 'haiku' },
    { command: 'effort', args: 'high' },
    { command: 'fast', args: 'on' },
  ])
  expect((await ui.find({ key: 'toggle' }))?.text).toMatch(/Haiku · High · Fast on/)
  expect(await ui.find({ key: '1m' })).toBeUndefined()
  await ui.unmount()
})

test('cede la band a una encuesta', async ($, on) => {
  on('config.list', () => ({ value: [MODEL_ROW] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND({ hasSurvey: true }), surface: 'terminal' })

  expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('mientras Claude trabaja solo se ve el resumen', async ($, on) => {
  on('config.list', () => ({ value: [MODEL_ROW] }))

  const ui = await $.ui.mount({ ...BAND({ isWorking: true }), surface: 'terminal' })

  expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /Opus · Auto · Fast off/ }))?.text).toBeDefined()
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
  await ui.press({ key: 'toggle' })
  await ui.press({ key: 'sonnet' })

  expect(toasts[0]).toMatch(/No se pudo cambiar a Sonnet/)
  await ui.unmount()
})
