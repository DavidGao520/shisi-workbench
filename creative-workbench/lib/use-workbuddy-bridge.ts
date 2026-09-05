'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BRIDGE_PROTOCOL,
  connectLocalBridge,
  deliveryCandidates,
  type BridgeStatus,
  type Delivery,
  type WorkBuddyBridge,
} from './workbuddy-bridge';
import type { Dataset, Mode } from './kitchen';

export function useWorkBuddyBridge(options: {
  dataset: Dataset;
  receive: (entry: Delivery) => Promise<boolean>;
  notify: (text: string) => void;
}) {
  const current = useRef(options);
  const client = useRef<WorkBuddyBridge | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [connection, setConnection] = useState<
    'checking' | 'standalone' | 'connected' | 'offline'
  >('checking');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  // Serialize delivery, begin, and cancel. Never ack a cancelled/unmounted receive.
  const operation = useRef(false);
  useEffect(() => {
    current.current = options;
  }, [options]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    try {
      client.current = connectLocalBridge();
    } catch {
      queueMicrotask(() => {
        if (!stopped)
          setProblem('浏览器不能保存本地连接身份，请检查存储权限。');
      });
    }
    if (!client.current) {
      queueMicrotask(() => {
        if (!stopped) setConnection('standalone');
      });
      return () => {
        stopped = true;
      };
    }
    const api = client.current;
    const poll = async () => {
      if (stopped) return;
      if (operation.current) {
        timer = setTimeout(() => void poll(), 1500);
        return;
      }
      operation.current = true;
      try {
        const nextStatus = await api.status();
        if (stopped) return;
        if (nextStatus.protocol !== BRIDGE_PROTOCOL)
          throw new Error('连接程序版本不同，请使用同一个完整包。');
        setConnection('connected');
        setStatus(nextStatus);
        const { entry } = await api.next();
        if (stopped || !entry) return;
        if (entry.envelope.dataset !== current.current.dataset) {
          setProblem(
            '另一厨房的识别结果已到达。请切换到' +
              (entry.envelope.dataset === 'real' ? '真实厨房' : '样例厨房') +
              '接收。',
          );
          return;
        }
        let count;
        try {
          count = deliveryCandidates(entry, current.current.dataset).length;
        } catch (e) {
          await api.ack(entry.ticketId, 'invalid');
          if (!stopped) {
            setProblem('这份识别结果未通过校验，请让 WorkBuddy 重新识别。');
            current.current.notify('识别结果已拒绝：' + (e as Error).message);
          }
          return;
        }
        if (count === 0) {
          await api.ack(entry.ticketId, 'empty');
          if (!stopped) {
            setProblem('这张照片未识别到食材，请重新拍清楚一些。');
            current.current.notify('未识别到食材，库存没有改变。');
          }
          return;
        }
        // receive includes protocol validation AND durable IndexedDB commit. Failure keeps the queued result.
        if (await current.current.receive(entry)) {
          if (stopped) return;
          await api.ack(entry.ticketId, 'staged');
          setProblem('');
        }
      } catch (e) {
        if (!stopped) {
          setConnection('offline');
          setProblem(
            (e as Error).message || '连接中断，结果会保留，恢复后重试。',
          );
        }
      } finally {
        operation.current = false;
        if (!stopped) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const begin = async (dataset: Dataset, mode: Mode) => {
    if (!client.current) return;
    if (operation.current) {
      setProblem('正在接收上一轮状态，请稍后再点一次。');
      return;
    }
    operation.current = true;
    setBusy(true);
    setProblem('');
    try {
      const { ticket } = await client.current.begin(dataset, mode);
      setStatus(await client.current.status());
      setConnection('connected');
      current.current.notify(
        '已准备接收。请在 WorkBuddy 对话上传照片，或发送核对过的食材文字。',
      );
      return ticket;
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };
  const cancel = async () => {
    if (!client.current || !status?.active) return;
    if (operation.current) {
      setProblem('正在接收上一轮状态，请稍后再取消。');
      return;
    }
    operation.current = true;
    setBusy(true);
    try {
      await client.current.cancel(status.active.id);
      setStatus(await client.current.status());
      setProblem('');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      operation.current = false;
    }
  };
  const beforeReset = async (dataset: Dataset) => {
    if (!client.current) return [];
    const { ticketIds } = await client.current.resetPreview(dataset);
    return ticketIds;
  };
  const afterReset = async (dataset: Dataset, ticketIds: string[]) => {
    if (client.current && ticketIds.length)
      await client.current.discard(dataset, ticketIds);
  };
  return {
    status,
    connection,
    problem,
    busy,
    begin,
    cancel,
    beforeReset,
    afterReset,
  };
}
