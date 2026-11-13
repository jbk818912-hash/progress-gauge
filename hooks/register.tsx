import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step, StepStatus } from '../types'

// Claude가 이미 쓰고 있는 작업 목록 도구를 엿보기만 한다.
// 새 도구나 시스템 프롬프트를 추가하지 않으므로 모델 토큰이 늘지 않는다.
// 데스크톱 앱: update_plan / wrap_up, 터미널: TodoWrite 또는 TaskCreate / TaskUpdate
const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

const steps = atom({ plugin: 'progress-gauge', key: 'steps' } as const, [] as Step[])
const isHidden = atom({ plugin: 'progress-gauge', key: 'isHidden' } as const, false)

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed']

const toStatus = (value: unknown): StepStatus =>
  STATUSES.includes(value as StepStatus) ? (value as StepStatus) : 'pending'

const toSteps = (items: unknown): Step[] | undefined => {
  if (!Array.isArray(items)) return undefined

  return items.map(item => {
    const record = (item ?? {}) as { content?: unknown; status?: unknown }

    return { content: String(record.content ?? ''), status: toStatus(record.status) }
  })
}

const toIndices = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : []

/** update_plan 한 번의 입력을 현재 단계 목록에 반영한다. */
export const applyPlan = (current: Step[], input: Record<string, unknown>): Step[] => {
  const replaced = toSteps(input.items)
  if (replaced) return replaced

  const next = current.map(step => ({ ...step }))
  const mark = (index: number, status: StepStatus) => {
    const step = next[index]
    if (step) step.status = status
  }

  if (input.advance === true) {
    const active = next.findIndex(step => step.status === 'in_progress')
    mark(active, 'completed')
    const upcoming = next.findIndex(
      (step, i) => i > active && step.status === 'pending',
    )
    mark(upcoming, 'in_progress')
  }

  for (const n of toIndices(input.done)) mark(n - 1, 'completed')

  if (typeof input.start === 'number') mark(input.start - 1, 'in_progress')

  return next
}

export const gauge = (done: number, total: number, width: number): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const isFinished = (list: readonly Step[]): boolean =>
  list.length > 0 && list.every(step => step.status === 'completed')

const CHIME = 'sounds/done.wav'

/**
 * 완료 효과음. 엔진의 $.audio는 Windows에서 소리를 내지 않으므로,
 * Windows에서는 기본 내장 플레이어(PowerShell SoundPlayer)로 재생한다.
 */
const playChime = async ($: EngineInterface): Promise<void> => {
  const root = $.plugin.root
  const isWindows = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\\\')

  if (!isWindows) {
    await $.audio.play({ asset: CHIME })
    return
  }

  const file = `${root}\\${CHIME.replaceAll('/', '\\')}`.replaceAll("'", "''")
  await $.process.run(
    [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `(New-Object System.Media.SoundPlayer '${file}').PlaySync()`,
    ],
    { timeoutMs: 10_000 },
  )
}

/** 단계 목록을 바꾸고, 방금 모든 단계가 끝났다면 효과음을 울린다. */
const applyChange = async (
  $: EngineInterface,
  change: (current: Step[]) => Step[],
): Promise<void> => {
  const before = await read($, steps)
  const after = change(before)
  await update($, steps, () => after)

  if (!isFinished(before) && isFinished(after)) {
    // 소리를 기다리지 않고 바로 넘어간다. 재생 실패는 무시한다.
    void playChime($).catch(() => undefined)
  }
}

export const register: Register = on => {
  // 게이지 갱신이 실패해도 도구 호출 자체는 절대 막지 않는다.
  on('tool.call', { tool: PLAN_TOOL }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      try {
        const input = e as unknown as Record<string, unknown>
        await applyChange($, current => applyPlan(current, input))
        if (Array.isArray(input.items)) await update($, isHidden, () => false)
      } catch {
        // 표시만 못 할 뿐, 작업은 그대로 진행된다.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: WRAP_TOOL }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      try {
        await applyChange($, current =>
          current.map(step => ({ ...step, status: 'completed' as const })),
        )
      } catch {
        // 위와 같다.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  // ── 터미널의 작업 목록 도구 ──────────────────────────────

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      try {
        const replaced = toSteps(e.todos) ?? []
        await applyChange($, () => replaced)
        await update($, isHidden, () => false)
      } catch {
        // 위와 같다.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      try {
        const id = ran.result.task?.id
        const content = ran.result.task?.subject ?? e.subject
        const before = await read($, steps)
        // 끝난 목록 뒤에 새 작업이 오면 새 목록으로 시작한다.
        if (isFinished(before)) await update($, isHidden, () => false)
        await applyChange($, current => [
          ...(isFinished(current) ? [] : current),
          { content, status: 'pending', ...(id ? { id } : {}) },
        ])
      } catch {
        // 위와 같다.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      try {
        await applyChange($, current =>
          e.status === 'deleted'
            ? current.filter(step => step.id !== e.taskId)
            : current.map(step =>
                step.id === e.taskId
                  ? {
                      ...step,
                      content: e.subject ?? step.content,
                      status:
                        e.status === undefined || e.status === 'deleted'
                          ? step.status
                          : e.status,
                    }
                  : step,
              ),
        )
      } catch {
        // 위와 같다.
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const isFolded = await read($, isHidden)

    const { Box, Button, Text } = $.ui.resolve(e)

    const total = list.length
    const done = list.filter(step => step.status === 'completed').length
    const percent = Math.round((done / total) * 100)
    const activeIndex = list.findIndex(step => step.status === 'in_progress')
    const active = list[activeIndex]
    const nextStep = list.find(
      (step, i) => i > activeIndex && step.status === 'pending',
    )
    const isFinished = done === total
    const width = Math.max(10, Math.min(24, e.props.bodyColumns - 30))

    const current = isFinished
      ? '모든 단계 완료'
      : active
        ? `${activeIndex + 1}단계 · ${active.content}`
        : '대기 중'

    // 접힌 상태: 완전히 사라지지 않고 한 줄 요약과 펼치기 버튼만 남는다.
    if (isFolded) {
      return (
        <Box columnGap={1}>
          <Text dimColor tabular wrap="truncate-end">
            {isFinished ? '✅' : '🎬'} {percent}% ({done}/{total}) · {current}
          </Text>
          <Button
            key="show"
            label="펼치기"
            plain
            dimColor
            onPress={() => update($, isHidden, () => false)}
          />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text bold>{isFinished ? '✅ 작업 완료' : '🎬 작업 진행도'}</Text>
          <Text color={isFinished ? 'success' : 'claude'} mono>
            {gauge(done, total, width)}
          </Text>
          <Text bold tabular>
            {percent}%
          </Text>
          <Text dimColor tabular>
            ({done}/{total})
          </Text>
        </Box>
        <Box columnGap={1}>
          <Text wrap="truncate-end">▶ 지금: {current}</Text>
          {nextStep && !isFinished ? (
            <Text dimColor wrap="truncate-end">
              · 다음: {nextStep.content}
            </Text>
          ) : null}
          <Button
            key="hide"
            label="접기"
            plain
            dimColor
            onPress={() => update($, isHidden, () => true)}
          />
        </Box>
      </Box>
    )
  })
}
