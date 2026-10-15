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
const mobileRoot = path.resolve(import.meta.dirname, '..');
const componentFile = path.join(mobileRoot, 'components/DevelopmentServiceQuoteComparison.tsx');
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => { render: (element: React.ReactNode) => void; unmount: () => void };
};

const host = (name: string) => function Host(props: any) {
  hosts.push({ name, props });
  return React.createElement('div', { 'data-host': name }, props.children);
};

function loadComponent(): React.ComponentType<any> {
  const output = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as any };
  const stack = host('Stack');
  const mocks: Record<string, any> = {
    react: React,
    'react-native': { ActivityIndicator: host('ActivityIndicator') },
    'lucide-react-native': new Proxy({}, { get: () => host('Icon') }),
    tamagui: { Text: host('Text'), XStack: stack, YStack: stack },
    '@/constants/colors': { __esModule: true, default: { gold: '#gold', success: '#success', danger: '#danger' } },
    '@/contexts/LanguageContext': { useLanguage: () => ({ isRTL, language: isRTL ? 'ar' : 'en' }) },
    '@/services/serviceQuoteComparison': {
      formatSyntheticQuoteMoney: (amount: number) => `SAR ${(amount / 100).toFixed(2)}`,
    },
    './ui/heavyar': {
      HeavyarBadge: host('HeavyarBadge'), HeavyarBadgeText: host('HeavyarBadgeText'), HeavyarButton: host('HeavyarButton'),
      HeavyarButtonText: host('HeavyarButtonText'), HeavyarSurface: host('HeavyarSurface'),
      useHeavyarDirection: () => ({ rowDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }),
    },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected quote-comparison dependency: ${id}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

const quote = {
  quoteId: `quote_${'Q'.repeat(43)}`,
  quoteVersion: 2,
  serviceKind: 'operator',
  serviceScope: 'Synthetic operator service scope',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' },
  inclusions: ['Operator time'], exclusions: ['Equipment rental'], serviceCategory: 'excavators', availability: 'declared_available',
  currency: 'SAR', baseServicePriceMinor: 120_000, optionalComponents: [], quotedServicePriceMinor: 120_000,
  expiresAt: '2026-10-20T12:00:00.000Z', status: 'active', eligibility: 'verified_by_future_authoritative_source',
};

function renderedText() {
  return container.textContent || '';
}

describe('M2-D4 isolated synthetic comparison UI', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let Component: React.ComponentType<any>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    isRTL = false;
    hosts = [];
    Component = loadComponent();
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('renders explicit loading, error, empty and expired states', async () => {
    await act(async () => root?.render(React.createElement(Component, { previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'loading', quotes: [] })));
    expect(hosts.some(item => item.name === 'ActivityIndicator')).toBe(true);
    hosts = [];
    await act(async () => root?.render(React.createElement(Component, { previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'error', quotes: [], onRetry: vi.fn() })));
    expect(renderedText()).toContain('Preview data could not be loaded');
    hosts = [];
    await act(async () => root?.render(React.createElement(Component, { previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'ready', quotes: [] })));
    expect(renderedText()).toContain('No preview offers');
    hosts = [];
    await act(async () => root?.render(React.createElement(Component, { previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'ready', quotes: [{ ...quote, status: 'expired' }] })));
    expect(renderedText()).toContain('Expired');
    expect(hosts.findLast(item => item.name === 'HeavyarButton')?.props.disabled).toBe(true);
  });

  it('supports accessible provisional selection without implying booking or payment', async () => {
    const select = vi.fn();
    await act(async () => root?.render(React.createElement(Component, {
      previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'ready', quotes: [quote], onPreviewSelect: select,
    })));
    expect(renderedText()).toContain('Internal synthetic-data preview');
    expect(renderedText()).toContain('no booking, contract, payment, or financial obligation');
    expect(renderedText()).toContain('Included');
    expect(renderedText()).toContain('Excluded');
    expect(renderedText()).toContain('Base service price');
    expect(renderedText()).toContain('Preview offer valid until');
    const button = hosts.findLast(item => item.name === 'HeavyarButton');
    expect(button?.props.accessibilityLabel).toBe('Provisionally select synthetic offer');
    await act(async () => button?.props.onPress());
    expect(select).toHaveBeenCalledWith(quote.quoteId);
  });

  it('renders equivalent Arabic RTL content and direction', async () => {
    isRTL = true;
    await act(async () => root?.render(React.createElement(Component, { previewMode: 'isolated_synthetic_only', serviceKind: 'operator', state: 'ready', quotes: [quote] })));
    expect(renderedText()).toContain('معاينة داخلية ببيانات اصطناعية');
    expect(renderedText()).toContain('الاختيار مبدئي فقط');
    expect(hosts.some(item => item.name === 'Stack' && item.props.flexDirection === 'row-reverse')).toBe(true);
  });

  it('is not connected to any app route or actual user navigation', () => {
    const source = fs.readFileSync(componentFile, 'utf8');
    expect(source).not.toMatch(/workerClient|firebase|firestore|useRouter|router\.|fetch\(/);
    const appFiles = fs.readdirSync(path.join(mobileRoot, 'app'), { recursive: true }).map(file => String(file)).filter(file => /\.tsx?$/.test(file));
    for (const file of appFiles) {
      expect(fs.readFileSync(path.join(mobileRoot, 'app', file), 'utf8')).not.toContain('DevelopmentServiceQuoteComparison');
    }
  });
});
