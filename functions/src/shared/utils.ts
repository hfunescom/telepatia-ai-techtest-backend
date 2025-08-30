export const ok = <T>(data: T) => ({ ok: true, data });
export const fail = (message: string, code = 400) => ({ ok: false, code, message });
