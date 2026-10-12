let n = 0
export const newId = () => `s${Date.now().toString(36)}${(n++).toString(36)}`
