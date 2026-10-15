// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isRTL = false;
let hosts: { name: string; props: any }[] = [];
let container: HTMLDivElement;
const require = createRequire(import.meta.url);
const componentFile = path.resolve(import.meta.dirname, '../components/ServiceQuoteComparison.tsx');
const { createRoot } = require('react-dom/client') as { createRoot: (container: Element) => { render(element: React.ReactNode): void; unmount(): void } };
const host = (name: string) => function Host(props: any) { hosts.push({ name, props }); return React.createElement('div', { 'data-host': name }, props.children); };

function loadComponent(): React.ComponentType<any> {
  const output = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as any }, stack = host('Stack');
  const mocks: Record<string, any> = {
    react: React,
    'react-native': { ActivityIndicator: host('ActivityIndicator') },
    'lucide-react-native': new Proxy({}, { get: () => host('Icon') }),
    tamagui: { Text: host('Text'), XStack: stack, YStack: stack },
    '@/constants/colors': { __esModule: true, default: { gold: '#gold', success: '#success', error: '#error', primary: '#navy' } },
    '@/contexts/LanguageContext': { useLanguage: () => ({ isRTL, language: isRTL ? 'ar' : 'en' }) },
    '@/services/serviceQuoteComparison': { formatSyntheticQuoteMoney: (amount: number) => `SAR ${(amount / 100).toFixed(2)}` },
    './ui/heavyar': {
      HeavyarBadge: host('HeavyarBadge'), HeavyarBadgeText: host('HeavyarBadgeText'), HeavyarButton: host('HeavyarButton'),
      HeavyarButtonText: host('HeavyarButtonText'), HeavyarSurface: host('HeavyarSurface'),
      useHeavyarDirection: () => ({ rowDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }),
    },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected RFQ UI dependency: ${id}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

const quote = {
  quoteId: `quote_${'Q'.repeat(43)}`, quoteVersion: 1, serviceKind: 'operator', serviceScope: 'Qualified operator service',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' }, inclusions: ['Operator time'],
  exclusions: ['Equipment rental'], serviceCategory: 'excavators', availability: 'declared_available', currency: 'SAR',
  baseServicePriceMinor: 120_000, optionalComponents: [], quotedServicePriceMinor: 120_000, expiresAt: '2026-10-20T12:00:00.000Z',
  status: 'active', eligibility: 'verified_by_future_authoritative_source',
};

describe('M2-E1 private quotation presentation', () => {
  let root: ReturnType<typeof createRoot> | undefined, Component: React.ComponentType<any>;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    isRTL = false; hosts = []; Component = loadComponent(); container = document.createElement('div'); root = createRoot(container);
  });
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

  it('shows explicit loading, error, empty and non-binding comparison states', async () => {
    await act(async () => root?.render(<Component serviceKind="operator" state="loading" quotes={[]} />));
    expect(hosts.some(item => item.name === 'ActivityIndicator')).toBe(true);
    await act(async () => root?.render(<Component serviceKind="operator" state="error" quotes={[]} onRetry={vi.fn()} />));
    expect(container.textContent).toContain('Offers could not be loaded');
    await act(async () => root?.render(<Component serviceKind="operator" state="ready" quotes={[]} />));
    expect(container.textContent).toContain('No offers yet');
    await act(async () => root?.render(<Component serviceKind="operator" state="ready" quotes={[quote]} onSelect={vi.fn()} />));
    expect(container.textContent).toContain('Private comparison — preliminary only');
    expect(container.textContent).toContain('no booking, contract, payment, or financial obligation');
  });

  it('renders Arabic RTL and exposes one accessible non-binding action', async () => {
    isRTL = true;
    const select = vi.fn();
    await act(async () => root?.render(<Component serviceKind="operator" state="ready" quotes={[quote]} onSelect={select} />));
    expect(container.textContent).toContain('مقارنة خاصة — قرار مبدئي فقط');
    expect(hosts.some(item => item.name === 'Stack' && item.props.flexDirection === 'row-reverse')).toBe(true);
    const button = hosts.findLast(item => item.name === 'HeavyarButton');
    await act(async () => button?.props.onPress());
    expect(select).toHaveBeenCalledWith(quote.quoteId);
  });
});
