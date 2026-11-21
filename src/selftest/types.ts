export interface CheckContext { cwd: string; fixture: string }
export interface Check { name: string; run: (context: CheckContext) => void | Promise<void> }
export interface Phase { phase: number; checks: Check[] }
