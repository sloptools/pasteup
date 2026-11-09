// Paths stay as the system gives them; on Windows that means backslashes.
const cut = (path: string) => Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))

export const fileOf = (path: string) => path.slice(cut(path) + 1)
export const dirOf = (path: string) => path.slice(0, Math.max(cut(path), 0))
