export type StepStatus = 'pending' | 'in_progress' | 'completed'
/** id: 터미널의 TaskCreate가 붙여 주는 작업 번호 (다른 방식에선 없음) */
export type Step = { content: string; status: StepStatus; id?: string }

declare module 'claude-code' {
  interface PluginState {
    'progress-gauge': { steps: Step[]; isHidden: boolean }
  }
}
