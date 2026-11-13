import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'progress-gauge',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
  },
} as const

const PLAN = 'mcp__ccd_turn__update_plan'

test('update_plan 호출이 게이지와 현재 단계로 그려진다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: PLAN,
    items: [
      { content: '컷 편집', status: 'in_progress' },
      { content: '자막 넣기', status: 'pending' },
      { content: '렌더링', status: 'pending' },
      { content: '검수', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: PLAN, advance: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe('25%')
    expect((await ui.find({ type: 'Text', text: /지금/ }))?.text).toBe(
      '▶ 지금: 2단계 · 자막 넣기',
    )
    expect((await ui.find({ type: 'Text', text: /다음/ }))?.text).toBe(
      '· 다음: 렌더링',
    )
    await ui.unmount()
  }
})

test('wrap_up 뒤에는 100% 완료로 바뀐다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: PLAN,
    items: [
      { content: '컷 편집', status: 'completed' },
      { content: '렌더링', status: 'in_progress' },
    ],
  })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '끝' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe('100%')
  expect((await ui.find({ type: 'Text', text: /지금/ }))?.text).toBe(
    '▶ 지금: 모든 단계 완료',
  )
  await ui.unmount()
})

test('모든 단계가 끝나는 순간 효과음이 딱 한 번 울린다', async ($, on) => {
  let chimes = 0
  on('tool.call', () => ({ result: {} }))
  on('process.run', () => {
    chimes += 1
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('audio.play', () => {
    chimes += 1
    return { value: undefined }
  })
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }

  await $.tool.call({
    tool: PLAN,
    items: [
      { content: '컷 편집', status: 'in_progress' },
      { content: '렌더링', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: PLAN, advance: true })
  await settle()
  expect(chimes).toBe(0)

  await $.tool.call({ tool: PLAN, advance: true })
  await settle()
  expect(chimes).toBe(1)

  // 이미 끝난 목록에 wrap_up이 와도 다시 울리지 않는다.
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '끝' })
  await settle()
  expect(chimes).toBe(1)
})

test('터미널: TodoWrite 목록이 게이지로 그려진다', async ($, on) => {
  on('tool.call', () => ({ result: { oldTodos: [], newTodos: [] } }))

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: '컷 편집', status: 'completed', activeForm: '컷 편집 중' },
      { content: '자막', status: 'in_progress', activeForm: '자막 넣는 중' },
      { content: '렌더링', status: 'pending', activeForm: '렌더링 중' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe('33%')
  expect((await ui.find({ type: 'Text', text: /지금/ }))?.text).toBe('▶ 지금: 2단계 · 자막')
  await ui.unmount()
})

test('터미널: TaskCreate·TaskUpdate로 진행되고 끝나면 효과음이 울린다', async ($, on) => {
  let chimes = 0
  let nextId = 0
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: String(++nextId), subject: e.subject } } }
      : { result: { success: true, taskId: '', updatedFields: [] } },
  )
  on('process.run', () => {
    chimes += 1
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('audio.play', () => {
    chimes += 1
    return { value: undefined }
  })
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }

  await $.tool.call({ tool: 'TaskCreate', subject: '컷 편집', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: '렌더링', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /지금/ }))?.text).toBe('▶ 지금: 1단계 · 컷 편집')
  await ui.unmount()

  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
  await settle()
  expect(chimes).toBe(0)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  await settle()
  expect(chimes).toBe(1)

  // 끝난 뒤 새 작업이 오면 새 목록으로 시작한다.
  await $.tool.call({ tool: 'TaskCreate', subject: '새 작업', description: '' })
  const fresh = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await fresh.find({ type: 'Text', text: /%/ }))?.text).toBe('0%')
  await fresh.unmount()
})

test('작업 목록이 없으면 띠를 그리지 않고 엔진에 넘긴다', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('접기를 누르면 한 줄로 줄고, 펼치기로 되돌아온다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: PLAN,
    items: [
      { content: 'A', status: 'completed' },
      { content: 'B', status: 'in_progress' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /지금/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe(
    '🎬 50% (1/2) · 2단계 · B',
  )

  await ui.press({ key: 'show' })
  expect((await ui.find({ type: 'Text', text: /지금/ }))?.text).toBe(
    '▶ 지금: 2단계 · B',
  )
  await ui.unmount()
})

test('접은 상태에서 새 작업 목록이 오면 다시 펼쳐진다', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: PLAN, items: [{ content: 'A', status: 'in_progress' }] })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'hide' })
  await ui.unmount()

  await $.tool.call({ tool: PLAN, items: [{ content: 'B', status: 'in_progress' }] })
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await again.find({ type: 'Text', text: /지금/ }))?.text).toBe('▶ 지금: 1단계 · B')
  await again.unmount()
})
