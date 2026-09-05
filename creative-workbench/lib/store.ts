import { emptyState, type Dataset, type KitchenState } from './kitchen';
const STORES = ['inventory', 'candidates', 'sessions', 'meta'] as const;
/** Each dataset has one record per store; all four stores participate in one transaction. */
export class IndexedDbStore {
  private db?: IDBDatabase;
  constructor(
    private name = 'zhonghua-shisi-kitchen-v1',
    private factory?: IDBFactory,
  ) {}
  async open() {
    if (this.db) return this.db;
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory)
      throw new Error(
        '当前页面无法使用 IndexedDB。请换稳定浏览器打开，不会改用其他库存。',
      );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(this.name, 1);
      req.onupgradeneeded = () => {
        for (const name of STORES)
          if (!req.result.objectStoreNames.contains(name))
            req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(
          new Error('数据库升级被旧页面阻塞，请关闭其他工作台页面后重试。'),
        );
    });
    db.onversionchange = () => {
      db.close();
      this.db = undefined;
    };
    this.db = db;
    return db;
  }
  close() {
    this.db?.close();
    this.db = undefined;
  }
  async read(dataset: Dataset) {
    return this.transaction(dataset);
  }
  async change(dataset: Dataset, apply: (state: KitchenState) => void) {
    return this.transaction(dataset, apply);
  }
  private async transaction(
    dataset: Dataset,
    apply?: (state: KitchenState) => void,
  ) {
    const db = await this.open();
    return new Promise<KitchenState>((resolve, reject) => {
      const tx = db.transaction([...STORES], apply ? 'readwrite' : 'readonly'),
        values: Record<string, unknown> = {};
      let count = 0,
        output: KitchenState,
        problem: unknown;
      tx.onabort = () =>
        reject(
          problem || tx.error || new Error('保存未完成，库存未改变，请重试。'),
        );
      tx.onerror = () => {
        problem ??= tx.error;
      };
      tx.oncomplete = () => resolve(output);
      for (const name of STORES) {
        const request = tx.objectStore(name).get(dataset);
        request.onsuccess = () => {
          values[name] = request.result;
          if (++count !== STORES.length) return;
          const base = emptyState(dataset);
          output = {
            ...base,
            ...(values.meta as object),
            dataset,
            inventory: (values.inventory as KitchenState['inventory']) || [],
            candidates: (values.candidates as KitchenState['candidates']) || [],
            sessions: (values.sessions as KitchenState['sessions']) || [],
          };
          if (!apply) return;
          try {
            apply(output);
            if (output.dataset !== dataset) throw new Error('禁止跨厨房写入。');
            output.revision += 1;
            const { inventory, candidates, sessions, ...meta } = output;
            tx.objectStore('inventory').put(inventory, dataset);
            tx.objectStore('candidates').put(candidates, dataset);
            tx.objectStore('sessions').put(sessions, dataset);
            tx.objectStore('meta').put(meta, dataset);
          } catch (error) {
            problem = error;
            tx.abort();
          }
        };
      }
    });
  }
}
