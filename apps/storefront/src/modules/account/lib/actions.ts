"use client"

/** Browser transport errors happen before a server action can return its state. */
export function safeAccountAction<State, Result>(action: (state: State, formData: FormData) => Promise<Result>, unavailable: Result) {
  return async (state: State, formData: FormData): Promise<Result> => {
    try { return await action(state, formData) } catch { return unavailable }
  }
}
