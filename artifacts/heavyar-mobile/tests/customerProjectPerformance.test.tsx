// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerProjectDetailRoute from '../app/projects/[id]';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'customer-a', role: 'customer' } as any },
  params: { id: 'project-a' },
  isRTL: false,
  flatListProps: undefined as any,
  renderedKeys: [] as string[],
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  alert: vi.fn(),
  getProject: vi.fn(),
  listLinks: vi.fn(),
  listCandidates: vi.fn(),
  updateProject: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
}));

vi.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  FlatList: (props: any) => {
    state.flatListProps = props;
    const visible = props.data.slice(0, props.initialNumToRender);
    state.renderedKeys = visible.map((item: any) => props.keyExtractor(item));
    return <div data-testid="project-flat-list">{visible.map((item: any, index: number) => <React.Fragment key={props.keyExtractor(item)}>{props.renderItem({ item, index, separators: {} })}{index < visible.length - 1 ? <props.ItemSeparatorComponent /> : null}</React.Fragment>)}</div>;
  },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => state.params,
  useRouter: () => ({ back: state.routerBack, push: state.routerPush }),
}));
vi.mock('lucide-react-native', () => {
  const Icon = () => <span data-testid="icon" />;
  return { AlertTriangle: Icon, Archive: Icon, CalendarDays: Icon, ChevronLeft: Icon, ChevronRight: Icon, FolderPlus: Icon, HardHat: Icon, Package: Icon, Trash2: Icon, Truck: Icon };
});
vi.mock('tamagui', () => ({
  Text: ({ children }: any) => <span>{children}</span>,
  XStack: ({ children, flexDirection }: any) => <div data-direction={flexDirection}>{children}</div>,
  YStack: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../constants/colors', () => ({ default: { gold: '#gold', error: '#error' } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ isRTL: state.isRTL, language: state.isRTL ? 'ar' : 'en' }) }));
vi.mock('../components/ui/heavyar', () => ({
  HeavyarBadge: ({ children }: any) => <div>{children}</div>,
  HeavyarBadgeText: ({ children }: any) => <span>{children}</span>,
  HeavyarButton: ({ children, onPress, disabled }: any) => <button type="button" disabled={disabled} onClick={onPress}>{children}</button>,
  HeavyarButtonText: ({ children }: any) => <span>{children}</span>,
  HeavyarEmptyState: ({ title, message, action }: any) => <div><span>{title}</span><span>{message}</span>{action}</div>,
  HeavyarIconButton: ({ children, onPress, disabled, accessibilityLabel }: any) => <button type="button" disabled={disabled} aria-label={accessibilityLabel} onClick={onPress}>{children}</button>,
  HeavyarInput: ({ value, onChangeText }: any) => <input value={value} onChange={event => onChangeText?.(event.target.value)} />,
  HeavyarLoadingState: ({ label }: any) => <div data-testid="loading">{label}</div>,
  HeavyarScreen: ({ children }: any) => <div>{children}</div>,
  HeavyarSegment: ({ children, onPress, selected }: any) => <button type="button" aria-pressed={selected} onClick={onPress}>{children}</button>,
  HeavyarSegmentText: ({ children }: any) => <span>{children}</span>,
  HeavyarSegmentedControl: ({ children }: any) => <div>{children}</div>,
  HeavyarSurface: ({ children }: any) => <section>{children}</section>,
  HeavyarTitle: ({ children }: any) => <h1>{children}</h1>,
  useHeavyarDirection: () => ({ rowDirection: state.isRTL ? 'row-reverse' : 'row', textAlign: state.isRTL ? 'right' : 'left' }),
}));
vi.mock('../services/customerProjectService', () => {
  class ScopeGuard {
    private currentToken: { uid: string; signal: AbortSignal; controller: AbortController } | null = null;
    begin(uid: string) {
      this.cancel();
      const controller = new AbortController();
      return this.currentToken = { uid, signal: controller.signal, controller };
    }
    isCurrent(token: unknown) { const current = this.currentToken; return !!current && current === token && !current.signal.aborted; }
    cancel() { this.currentToken?.controller.abort(); this.currentToken = null; }
  }
  return {
    CustomerProjectScopeGuard: ScopeGuard,
    customerProjectOperationKey: (scope: string) => `${scope}:test`,
    customerProjectScheduleConflicts: (items: any[]) => {
      const conflicts = new Set<string>();
      for (let left = 0; left < items.length; left += 1) for (let right = left + 1; right < items.length; right += 1) {
        const a = items[left], b = items[right];
        if (a.startAt && a.endAt && b.startAt && b.endAt && Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt)) {
          conflicts.add(a.sourceId); conflicts.add(b.sourceId);
        }
      }
      return conflicts;
    },
    formatCustomerProjectMoney: (financial: any) => financial.amountMinor === null ? '' : `${financial.currency} ${(financial.amountMinor / (financial.currencyDecimals === 3 ? 1_000 : 100)).toFixed(financial.currencyDecimals)}`,
    getCustomerProject: (...args: unknown[]) => state.getProject(...args),
    listCustomerProjectLinks: (...args: unknown[]) => state.listLinks(...args),
    listEligibleProjectSources: (...args: unknown[]) => state.listCandidates(...args),
    updateCustomerProject: (...args: unknown[]) => state.updateProject(...args),
    attachCustomerProjectSource: (...args: unknown[]) => state.attach(...args),
    detachCustomerProjectSource: (...args: unknown[]) => state.detach(...args),
  };
});

const project = (overrides: Record<string, unknown> = {}) => ({
  projectId: 'project-a', title: 'Site work', description: 'Independent requests', status: 'active' as const,
  revision: 2, requestCount: 2, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T01:00:00.000Z', ...overrides,
});
const source = (index: number, overrides: Record<string, unknown> = {}) => ({
  sourceKind: 'rental' as const, sourceId: `request-${index}`, titleAr: `طلب ${index}`, titleEn: `Request ${index}`,
  providerLabelAr: `مقدم ${index}`, providerLabelEn: `Provider ${index}`, status: 'accepted',
  startAt: new Date(Date.UTC(2026, 10, 1, index * 2)).toISOString(), endAt: new Date(Date.UTC(2026, 10, 1, index * 2 + 1)).toISOString(),
  financial: { state: 'estimate' as const, currency: 'SAR' as const, currencyDecimals: 2 as const, amountMinor: 10_000 + index },
  route: `/request/request-${index}`, linkedProjectId: null, ...overrides,
});
const link = (index: number, overrides: Record<string, unknown> = {}) => ({
  linkId: `link-${index}`, projectId: 'project-a', sourceKind: 'rental' as const, sourceId: `request-${index}`,
  createdAt: '2026-10-15T01:00:00.000Z', item: source(index), ...overrides,
});

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;

async function renderScreen() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(<CustomerProjectDetailRoute />));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function rerenderScreen() {
  await act(async () => root!.render(<CustomerProjectDetailRoute />));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
function button(label: string) {
  return Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes(label)) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.auth = { user: { uid: 'customer-a', role: 'customer' } };
  state.params = { id: 'project-a' };
  state.isRTL = false;
  state.flatListProps = undefined;
  state.renderedKeys = [];
  for (const mock of [state.routerBack, state.routerPush, state.alert, state.getProject, state.listLinks, state.listCandidates, state.updateProject, state.attach, state.detach]) mock.mockReset();
  state.getProject.mockResolvedValue(project());
  state.listLinks.mockResolvedValue({ links: [], nextCursor: null });
  state.listCandidates.mockResolvedValue({ items: [], nextCursor: null });
  state.updateProject.mockResolvedValue(project({ revision: 3 }));
  state.attach.mockResolvedValue(project({ revision: 3 }));
  state.detach.mockResolvedValue(project({ revision: 3 }));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

describe('P2-C Project Hub virtualization and lifecycle', () => {
  it('keeps 1,000 accumulated linked requests in one bounded virtualized owner with summary and warnings visible', async () => {
    const links = Array.from({ length: 1_000 }, (_, index) => link(index));
    links[1] = link(1, { item: source(1, { startAt: links[0].item.startAt, endAt: links[0].item.endAt }) });
    state.listLinks.mockResolvedValueOnce({ links, nextCursor: null });
    await renderScreen();

    expect(state.flatListProps.data.filter((row: any) => row.type === 'link')).toHaveLength(1_000);
    expect(state.flatListProps.initialNumToRender).toBe(8);
    expect(state.flatListProps.maxToRenderPerBatch).toBe(8);
    expect(state.renderedKeys).toHaveLength(8);
    expect(host.textContent).toContain('Project summary');
    expect(host.textContent).toContain('Schedule overlap warning');
    expect(state.listLinks).toHaveBeenCalledTimes(1);
    expect(state.listCandidates).not.toHaveBeenCalled();
  });

  it('virtualizes 1,000 eligible candidates and never loads them before explicit user action', async () => {
    state.listCandidates.mockResolvedValueOnce({ items: Array.from({ length: 1_000 }, (_, index) => source(index)), nextCursor: null });
    await renderScreen();
    expect(state.listCandidates).not.toHaveBeenCalled();
    await act(async () => button('Show available requests')?.click());

    expect(state.listCandidates).toHaveBeenCalledTimes(1);
    expect(state.flatListProps.data.filter((row: any) => row.type === 'candidate')).toHaveLength(1_000);
    expect(state.renderedKeys).toHaveLength(8);
    expect(state.renderedKeys.filter(key => key.startsWith('candidate:')).length).toBeLessThan(1_000);
  });

  it('appends manual pages without duplicate rows or reordering and performs no eager pagination', async () => {
    state.listLinks
      .mockResolvedValueOnce({ links: [link(0)], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ links: [link(0), link(1), link(1), link(2)], nextCursor: null });
    await renderScreen();
    expect(state.listLinks).toHaveBeenCalledTimes(1);
    await act(async () => button('Load more requests')?.click());
    const ids = state.flatListProps.data.filter((row: any) => row.type === 'link').map((row: any) => row.link.linkId);
    expect(ids).toEqual(['link-0', 'link-1', 'link-2']);
    expect(state.listLinks).toHaveBeenCalledTimes(2);
  });

  it('keeps candidate error and explicit retry states functional without automatic retries', async () => {
    state.listCandidates.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [], nextCursor: null });
    await renderScreen();
    await act(async () => button('Show available requests')?.click());
    expect(host.textContent).toContain('Requests could not be loaded.');
    expect(state.listCandidates).toHaveBeenCalledTimes(1);
    await act(async () => button('Retry')?.click());
    expect(state.listCandidates).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('No eligible requests.');
  });

  it('preserves money, status, navigation, attach, detach, rename, and archive actions', async () => {
    const paid = link(0, { item: source(0, { financial: { state: 'paid', currency: 'SAR', currencyDecimals: 2, amountMinor: 11_500 } }) });
    state.listLinks.mockResolvedValue({ links: [paid], nextCursor: null });
    state.listCandidates.mockResolvedValueOnce({ items: [source(5)], nextCursor: null });
    await renderScreen();
    expect(host.textContent).toContain('Paid for this request: SAR 115.00');
    await act(async () => button('Open original request')?.click());
    expect(state.routerPush).toHaveBeenCalledWith('/request/request-0');

    await act(async () => button('Rename')?.click());
    const title = host.querySelector('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(title, 'Renamed project');
      title.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('Save')?.click());
    expect(state.updateProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Renamed project' }), 'rename:test', 'customer-a', expect.any(AbortSignal));

    await act(async () => button('Archive')?.click());
    const archiveOptions = state.alert.mock.calls.at(-1)?.[2];
    await act(async () => archiveOptions?.[1]?.onPress());
    expect(state.updateProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'archived' }), 'archive:test', 'customer-a', expect.any(AbortSignal));

    await act(async () => (host.querySelector('button[aria-label="Remove request from project"]') as HTMLButtonElement)?.click());
    const detachOptions = state.alert.mock.calls.at(-1)?.[2];
    await act(async () => detachOptions?.[1]?.onPress());
    expect(state.detach).toHaveBeenCalled();

    await act(async () => button('Show available requests')?.click());
    await act(async () => button('Add')?.click());
    expect(state.attach).toHaveBeenCalled();
  });

  it('cancels stale route/account work, clears private rows, and preserves Arabic and English actions', async () => {
    const oldProject = deferred<ReturnType<typeof project>>();
    const oldLinks = deferred<{ links: ReturnType<typeof link>[]; nextCursor: null }>();
    state.getProject.mockReturnValueOnce(oldProject.promise);
    state.listLinks.mockReturnValueOnce(oldLinks.promise);
    await renderScreen();
    const oldSignal = state.getProject.mock.calls[0][2] as AbortSignal;

    state.params = { id: 'project-b' };
    state.getProject.mockResolvedValueOnce(project({ projectId: 'project-b', title: 'Project B' }));
    state.listLinks.mockResolvedValueOnce({ links: [link(7, { projectId: 'project-b' })], nextCursor: null });
    await rerenderScreen();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      oldProject.resolve(project({ title: 'Old private project' }));
      oldLinks.resolve({ links: [link(99)], nextCursor: null });
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Project B');
    expect(host.textContent).not.toContain('Old private project');
    expect(host.textContent).not.toContain('Request 99');

    state.auth = { user: { uid: 'customer-b', role: 'customer' } };
    state.isRTL = true;
    state.getProject.mockResolvedValueOnce(project({ projectId: 'project-b', title: 'مشروع ب' }));
    state.listLinks.mockResolvedValueOnce({ links: [], nextCursor: null });
    await rerenderScreen();
    expect(host.textContent).toContain('ملخص المشروع');
    expect(host.textContent).toContain('إضافة طلب مستقل');
    expect(host.textContent).not.toContain('Request 7');
    expect(host.querySelector('[data-direction="row-reverse"]')).toBeTruthy();
  });
});
