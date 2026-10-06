export const RUNTIME_MODE = { LOCAL: 'local', ACCOUNTS: 'accounts' } as const
export type RuntimeMode = (typeof RUNTIME_MODE)[keyof typeof RUNTIME_MODE]
export interface RuntimeInfo { mode: RuntimeMode }
export interface AccountUser { id: string; username: string }
export interface AccountSession { user: AccountUser | null; csrfToken: string | null }
