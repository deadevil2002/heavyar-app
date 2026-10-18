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
const componentFile = path.resolve(import.meta.dirname, '../components/ServiceContractAcceptance.tsx');
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
    '@/constants/colors': { __esModule: true, default: { gold: '#gold', success: '#success', primary: '#navy' } },
    '@/contexts/LanguageContext': { useLanguage: () => ({ isRTL, language: isRTL ? 'ar' : 'en' }) },
    '@/services/serviceQuoteComparison': { formatSyntheticQuoteMoney: (amount: number, language: string) => language === 'ar' ? `${amount / 100} ر.س` : `SAR ${(amount / 100).toFixed(2)}` },
    './ui/heavyar': {
      HeavyarBadge: host('HeavyarBadge'), HeavyarBadgeText: host('HeavyarBadgeText'), HeavyarButton: host('HeavyarButton'),
      HeavyarButtonText: host('HeavyarButtonText'), HeavyarSurface: host('HeavyarSurface'),
      useHeavyarDirection: () => ({ rowDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }),
    },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected contract UI dependency: ${id}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

const selectedQuote = {
  quoteId: `quote_${'Q'.repeat(43)}`, quoteVersion: 1, serviceKind: 'operator', serviceScope: 'Qualified operator service',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' }, inclusions: ['Operator time'],
  exclusions: ['Equipment rental'], serviceCategory: 'excavators', availability: 'declared_available', currency: 'SAR',
  baseServicePriceMinor: 120_000, optionalComponents: [], quotedServicePriceMinor: 120_000, expiresAt: '2026-10-20T12:00:00.000Z',
  status: 'provisionally_selected', eligibility: 'verified_by_future_authoritative_source',
};

describe('Launch Packet 1 contract acceptance presentation', () => {
  let root: ReturnType<typeof createRoot> | undefined, Component: React.ComponentType<any>;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    isRTL = false; hosts = []; Component = loadComponent(); container = document.createElement('div'); root = createRoot(container);
  });
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

  it('shows an accessible explicit test-only acceptance without payment or booking claims', async () => {
    const accept = vi.fn();
    await act(async () => root?.render(<Component access="customer" selectedQuote={selectedQuote} contract={null} busy={false} onAccept={accept} />));
    expect(container.textContent).toContain('Local test only — not commercially activated');
    expect(container.textContent).toContain('Test terms version: synthetic-local-test-v1');
    expect(container.textContent).toContain('does not prove payment, booking, or legal contract signing');
    expect(container.textContent).not.toContain('Paid');
    expect(container.textContent).not.toContain('Confirmed Booking');
    expect(container.textContent).not.toContain('Contract Signed');
    expect(container.textContent).not.toContain('Ready to Dispatch');
    const button = hosts.find(item => item.name === 'HeavyarButton');
    expect(button?.props.accessibilityLabel).toContain('Accept the test terms version');
    await act(async () => button?.props.onPress());
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('renders Arabic RTL and pending-payment as unverified rather than paid', async () => {
    isRTL = true;
    const contract = {
      status: 'pending_payment', revision: 2, rfqRevisionAtSelection: 3, selectedQuote, terms: { version: 'synthetic-local-test-v1' },
      customerAcceptance: { acceptedAt: '2026-10-18T08:00:00.000Z' }, providerAcceptance: { acceptedAt: '2026-10-18T08:01:00.000Z' },
    };
    await act(async () => root?.render(<Component access="provider" selectedQuote={selectedQuote} contract={contract} busy={false} onAccept={vi.fn()} />));
    expect(container.textContent).toContain('بانتظار التحقق من الدفع');
    expect(container.textContent).toContain('لا يثبت الدفع أو الحجز');
    expect(hosts.some(item => item.name === 'Stack' && item.props.flexDirection === 'row-reverse')).toBe(true);
    expect(hosts.filter(item => item.name === 'HeavyarButton')).toHaveLength(0);
  });
});
