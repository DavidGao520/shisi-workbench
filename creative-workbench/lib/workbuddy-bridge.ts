import {
  parseImport,
  stage,
  type Dataset,
  type KitchenState,
  type Mode,
} from './kitchen';

export const BRIDGE_PROTOCOL = 'zhonghua-shisi-bridge-1';
export const BRIDGE_URL = 'http://127.0.0.1:43117/';
export type Ticket = {
  id: string;
  dataset: Dataset;
  mode: Mode;
  expiresAt: number;
};
export type BridgeStatus = {
  protocol: string;
  workspaceId: string;
  active: Ticket | null;
  otherActive: boolean;
  pending: number;
};
export type Delivery = { ticketId: string; envelope: Record<string, unknown> };

export function databaseName() {
  const id =
    typeof document === 'undefined'
      ? ''
      : document
          .querySelector('meta[name="kitchen-workspace"]')
          ?.getAttribute('content');
  return (
    'zhonghua-shisi-kitchen-v1' +
    (id && /^[a-f0-9-]{36}$/.test(id) ? '-' + id : '')
  );
}

/** Run inside the IndexedDB transaction. A transport ack is never inventory confirmation. */
export function deliveryCandidates(delivery: Delivery, dataset: Dataset) {
  const envelope = delivery.envelope;
  if (envelope.dataset !== dataset)
    throw new Error('识别结果属于另一厨房，请切换后接收。');
  if (!['stocktake', 'restock'].includes(String(envelope.mode)))
    throw new Error('识别方式无效。');
  if (
    envelope.requestId !== 'wb-' + delivery.ticketId ||
    !['workbuddy-image', 'workbuddy-voice-transcript'].includes(
      String(envelope.source),
    )
  )
    throw new Error('识别结果与等待任务不一致。');
  if (
    envelope.schemaVersion !== '1.0' ||
    typeof envelope.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(envelope.createdAt)) ||
    !Array.isArray(envelope.warnings)
  )
    throw new Error('识别结果格式不完整。');
  if (Array.isArray(envelope.candidates) && envelope.candidates.length === 0)
    return [];
  return parseImport(JSON.stringify(envelope), dataset, envelope.mode as Mode);
}
export function stageDelivery(state: KitchenState, delivery: Delivery) {
  if (state.bridgeIgnoredTicketIds?.includes(delivery.ticketId)) return 0;
  const candidates = deliveryCandidates(delivery, state.dataset);
  const before = state.candidates.length;
  stage(state, candidates);
  return state.candidates.length - before;
}

export class WorkBuddyBridge {
  constructor(
    private clientId: string,
    private base = '',
  ) {}
  async call<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(this.base + '/bridge/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'X-Kitchen-Client': this.clientId,
        'Content-Type': 'application/json',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      cache: 'no-store',
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || '本地连接暂不可用。');
    return result as T;
  }
  status() {
    return this.call<BridgeStatus>('status');
  }
  begin(dataset: Dataset, mode: Mode) {
    return this.call<{ ticket: Ticket }>('intake', { dataset, mode });
  }
  cancel(ticketId: string) {
    return this.call('cancel', { ticketId });
  }
  resetPreview(dataset: Dataset) {
    return this.call<{ ticketIds: string[] }>('reset-preview', { dataset });
  }
  discard(dataset: Dataset, ticketIds: string[]) {
    return this.call<{ ticketIds: string[] }>('discard', {
      dataset,
      ticketIds,
    });
  }
  next() {
    return this.call<{ entry: Delivery | null }>('next');
  }
  ack(ticketId: string, status: 'staged' | 'invalid' | 'empty') {
    return this.call('ack', { ticketId, status });
  }
}

export function connectLocalBridge(): WorkBuddyBridge | null {
  if (
    location.origin + '/' !== BRIDGE_URL ||
    !document.querySelector('meta[name="kitchen-workspace"]')
  )
    return null;
  const key = 'zhonghua-shisi-delivery-client:' + databaseName();
  let id = localStorage.getItem(key);
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return new WorkBuddyBridge(id);
}
