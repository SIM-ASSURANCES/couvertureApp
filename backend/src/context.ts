import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  ip?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** IP de la requête courante (capturée par le middleware dans index.ts) */
export function currentIp(): string | undefined {
  return requestContext.getStore()?.ip;
}
