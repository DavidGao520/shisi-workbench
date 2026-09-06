'use client';
import { useEffect, useRef, useState } from 'react';
import { connectLocalBridge, type WorkBuddyBridge } from './workbuddy-bridge';
import {
  checkCookingDelivery,
  cookingRequest,
  type CookingDelivery,
  type CookingTicket,
} from './workbuddy-cooking';
import type { Dataset } from './kitchen';

export function useWorkBuddyCooking(options: {
  dataset: Dataset;
  receive: (entry: CookingDelivery) => Promise<boolean>;
  ignore: (ticket: CookingTicket) => Promise<boolean>;
  notify: (message: string) => void;
}) {
  const current = useRef(options);
  useEffect(() => {
    current.current = options;
  }, [options]);
  const api = useRef<WorkBuddyBridge | null>(null),
    operation = useRef(false),
    actionRequested = useRef(false);
  const [ticket, setTicket] = useState<CookingTicket | null>(null),
    [problem, setProblem] = useState(''),
    [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    try {
      api.current = connectLocalBridge();
    } catch {
      api.current = null;
    }
    if (!api.current) return;
    const client = api.current;
    const poll = async () => {
      if (stopped) return;
      if (operation.current || actionRequested.current) {
        timer = setTimeout(() => void poll(), 1500);
        return;
      }
      operation.current = true;
      try {
        const status = await client.call<{ ticket: CookingTicket | null }>(
          'cooking/status',
        );
        if (stopped) return;
        setTicket(status.ticket);
        setConnected(true);
        const { entry } = await client.call<{ entry: CookingDelivery | null }>(
          'cooking/next',
        );
        if (stopped || !entry) return;
        if (entry.request.dataset !== current.current.dataset) return;
        try {
          checkCookingDelivery(entry, current.current.dataset);
        } catch (e) {
          await client.call('cooking/ack', {
            ticketId: entry.ticketId,
            status: 'invalid',
          });
          if (!stopped) setProblem((e as Error).message);
          return;
        }
        if (await current.current.receive(entry)) {
          if (stopped) return;
          await client.call('cooking/ack', {
            ticketId: entry.ticketId,
            status: 'received',
          });
          setTicket(null);
          setProblem('');
        }
      } catch (e) {
        if (!stopped) {
          setConnected(false);
          setProblem((e as Error).message);
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
  // Give a click priority over the next background poll without dropping the click.
  const acquire = async () => {
    const deadline = Date.now() + 12000;
    while (operation.current) {
      if (Date.now() >= deadline)
        throw new Error('本地连接响应较慢，请稍后重试。');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    operation.current = true;
  };
  const begin = async (recipeId: string) => {
    if (!api.current) {
      setProblem('请从原来的本机厨房入口打开，才能交给 WorkBuddy。');
      return;
    }
    if (actionRequested.current) return;
    const dataset = current.current.dataset;
    actionRequested.current = true;
    let acquired = false;
    setBusy(true);
    setProblem('');
    try {
      await acquire();
      acquired = true;
      if (current.current.dataset !== dataset)
        throw new Error('厨房已切换，请在当前厨房重新选择。');
      const { ticket } = await api.current.call<{ ticket: CookingTicket }>(
        'cooking/begin',
        cookingRequest(dataset, recipeId),
      );
      setTicket(ticket);
      setConnected(true);
      current.current.notify(
        '菜名和用料已准备好。请在 WorkBuddy 说“读取厨房任务，生成做菜步骤”。',
      );
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      if (acquired) operation.current = false;
      actionRequested.current = false;
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!api.current || !ticket) return;
    if (actionRequested.current) return;
    actionRequested.current = true;
    let acquired = false;
    setBusy(true);
    try {
      await acquire();
      acquired = true;
      if (!(await current.current.ignore(ticket)))
        throw new Error('未保存取消标记，请稍后重试。');
      await api.current.call('cooking/cancel', { ticketId: ticket.ticketId });
      setTicket(null);
      setProblem('');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      if (acquired) operation.current = false;
      actionRequested.current = false;
      setBusy(false);
    }
  };
  return { ticket, problem, busy, connected, begin, cancel };
}
