// @vitest-environment jsdom
import React, { act, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createNotificationOperationGuard } from '../services/notificationOperationGuard';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve };
};

function RaceHarness({ oldCount, markAll }: { oldCount: Promise<number>; markAll: Promise<number> }) {
  const guard = useRef(createNotificationOperationGuard()).current;
  const [count, setCount] = useState(-1);
  const [rows, setRows] = useState([false, false]);
  guard.setIdentity('provider');
  useEffect(() => {
    const snapshot = guard.mutationSnapshot();
    void oldCount.then(value => {
      if (guard.mutationIsCurrent(snapshot)) setCount(value);
    });
    return () => guard.invalidate();
  }, [guard, oldCount]);
  const runMarkAll = () => {
    const lock = guard.tryLockMutation();
    if (lock === null) return;
    const current = guard.beginMutation('provider', 'markAll');
    void guard.serializeWrite(() => markAll).then(value => {
      if (current()) {
        setCount(value);
        setRows(currentRows => currentRows.map(() => true));
      }
    }).finally(() => {
      guard.unlockMutation(lock);
    });
  };
  const runItem = () => {
    const lock = guard.tryLockMutation();
    if (lock === null) return;
    setRows(currentRows => currentRows.map((read, index) => index === 0 ? true : read));
    guard.unlockMutation(lock);
  };
  return <><span data-testid="count">{count}</span><span data-testid="rows">{rows.map(value => value ? 'r' : 'u').join('')}</span><button onClick={runMarkAll}>mark all</button><button onClick={runItem}>item</button></>;
}

describe('mounted notification count races', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let host: HTMLDivElement;
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

  it('does not let an old list/count reply overwrite a later mark-all result', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const oldCount = deferred<number>();
    const markAll = deferred<number>();
    host = document.createElement('div');
    root = createRoot(host);
    await act(async () => root?.render(<RaceHarness oldCount={oldCount.promise} markAll={markAll.promise} />));
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click());
    await act(async () => oldCount.resolve(16));
    expect(host.querySelector('[data-testid="count"]')?.textContent).toBe('-1');
    await act(async () => markAll.resolve(0));
    expect(host.querySelector('[data-testid="count"]')?.textContent).toBe('0');
  });

  it('ignores an item tap while mark-all is deferred, then marks every row read at zero', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const oldCount = deferred<number>();
    const markAll = deferred<number>();
    host = document.createElement('div');
    root = createRoot(host);
    await act(async () => root?.render(<RaceHarness oldCount={oldCount.promise} markAll={markAll.promise} />));
    const buttons = host.querySelectorAll('button');
    await act(async () => (buttons[0] as HTMLButtonElement).click());
    await act(async () => (buttons[1] as HTMLButtonElement).click());
    expect(host.querySelector('[data-testid="rows"]')?.textContent).toBe('uu');
    await act(async () => markAll.resolve(0));
    expect(host.querySelector('[data-testid="count"]')?.textContent).toBe('0');
    expect(host.querySelector('[data-testid="rows"]')?.textContent).toBe('rr');
  });
});