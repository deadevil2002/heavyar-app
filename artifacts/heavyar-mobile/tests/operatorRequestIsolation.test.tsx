// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve };
}

type TestUser = { uid: string; role: string; countryCode: string; region: string };
let currentUser: TestUser | null = { uid: 'account-a', role: 'customer', countryCode: 'SA', region: 'riyadh' };
let profileId = 'operator_profile_0001';
let hosts: { name: string; props: any }[] = [];
const effects = { prepare: vi.fn(), create: vi.fn(), replace: vi.fn() };
const require = createRequire(import.meta.url);
const mobileRoot = path.resolve(import.meta.dirname, '..');
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => { render: (element: React.ReactNode) => void; unmount: () => void };
};

const host = (name: string) => function Host(props: any) {
  hosts.push({ name, props });
  return React.createElement('div', { 'data-host': name }, props.children);
};
const HeavyarInput = host('HeavyarInput');
const HeavyarButton = host('HeavyarButton');
const LocationPicker = host('LocationPicker');

function loadScreen(): React.ComponentType {
  const file = path.join(mobileRoot, 'app/operator-request-prepare.tsx');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as any };
  const stack = host('Stack');
  const mocks: Record<string, any> = {
    react: React,
    'react-native': { KeyboardAvoidingView: host('KeyboardAvoidingView'), Platform: { OS: 'android' }, ScrollView: host('ScrollView') },
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-router': {
      useRouter: () => ({ back: vi.fn(), replace: effects.replace }),
      useLocalSearchParams: () => ({ profileId }),
    },
    'lucide-react-native': new Proxy({}, { get: () => host('Icon') }),
    tamagui: { Text: host('Text'), XStack: stack, YStack: stack },
    '@/components/location/LocationPicker': { __esModule: true, default: LocationPicker },
    '@/components/ui/heavyar': {
      HeavyarButton, HeavyarButtonText: host('HeavyarButtonText'), HeavyarChip: host('HeavyarChip'), HeavyarChipText: host('HeavyarChipText'),
      HeavyarIconButton: host('HeavyarIconButton'), HeavyarInput, HeavyarScreen: host('HeavyarScreen'), HeavyarSurface: host('HeavyarSurface'),
      HeavyarTitle: host('HeavyarTitle'), useHeavyarDirection: () => ({ rowDirection: 'row', textAlign: 'left' }),
    },
    '@/constants/colors': { __esModule: true, default: { gold: '#gold', success: '#success', primary: '#primary' } },
    '@/contexts/AuthContext': { useAuth: () => ({ user: currentUser, accountState: currentUser ? 'authenticated_complete' : 'unauthenticated' }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ language: 'en', isRTL: false }) },
    '@/mocks/categories': { mockCategories: [
      { id: 'excavators', nameAr: 'حفارات', nameEn: 'Excavators' },
      { id: 'cranes', nameAr: 'رافعات', nameEn: 'Cranes' },
    ] },
    '@/services/rentalV2': {
      addCalendarDays: (date: string, days: number) => {
        const result = new Date(`${date}T00:00:00.000Z`);
        result.setUTCDate(result.getUTCDate() + days);
        return result.toISOString().slice(0, 10);
      },
      marketClock: () => ({ offsetMinutes: 0 }),
      marketDateTimeToUtc: (date: string, time: string) => new Date(`${date}T${time}:00.000Z`).toISOString(),
    },
    '@/services/operatorService': { prepareOperatorRequest: effects.prepare },
    '@/services/serviceRfqService': {
      createServiceRfq: effects.create,
      serviceRfqIdempotencyKey: (scope: string) => `${scope}:test-key-0001`,
    },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected operator-request dependency: ${id}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

function input(placeholder: string) {
  return hosts.findLast(item => item.name === 'HeavyarInput' && item.props.placeholder === placeholder)?.props;
}
function inputs(placeholder: string, count: number) {
  return hosts.filter(item => item.name === 'HeavyarInput' && item.props.placeholder === placeholder).slice(-count).map(item => item.props);
}
function locationPicker() {
  return hosts.findLast(item => item.name === 'LocationPicker')?.props;
}
function submitButton() {
  return hosts.findLast(item => item.name === 'HeavyarButton')?.props;
}
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function completeDraft(label: string) {
  await act(async () => {
    input('Example: Riyadh')?.onChangeText(label === 'A' ? 'private-a' : 'private-b');
    input('Short requirements without sensitive personal data')?.onChangeText(`Account ${label} private notes`);
    locationPicker()?.onConfirm({ lat: label === 'A' ? 24.7 : 21.5, lng: label === 'A' ? 46.6 : 39.2, instructions: `Account ${label} work site` });
  });
}

describe('M2-E1 operator-request account isolation', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let Screen: React.ComponentType;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    currentUser = { uid: 'account-a', role: 'customer', countryCode: 'SA', region: 'riyadh' };
    profileId = 'operator_profile_0001';
    hosts = [];
    effects.prepare.mockReset().mockResolvedValue({ status: 'prepared_not_submitted' });
    effects.create.mockReset().mockResolvedValue({ rfq: { rfqId: `rfq_${'R'.repeat(43)}` } });
    effects.replace.mockReset();
    Screen = loadScreen();
    root = createRoot(document.createElement('div'));
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('synchronously remounts every private draft value and operation scope for Account B', async () => {
    await act(async () => root?.render(React.createElement(Screen)));
    await completeDraft('A');
    await act(async () => {
      const [startDate, endDate] = inputs('YYYY-MM-DD', 2);
      const [startTime, endTime] = inputs('HH:mm', 2);
      startDate.onChangeText('2099-01-01'); endDate.onChangeText('2099-01-02');
      startTime.onChangeText('01:00'); endTime.onChangeText('02:00');
      hosts.filter(item => item.name === 'HeavyarChip').slice(-2)[1].props.onPress();
    });

    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Example: Riyadh')?.value).toBe('jeddah');
    expect(input('Short requirements without sensitive personal data')?.value).toBe('');
    expect(locationPicker()?.value).toBeNull();
    expect(inputs('YYYY-MM-DD', 2).map(item => item.value)).not.toContain('2099-01-01');
    expect(inputs('HH:mm', 2).map(item => item.value)).toEqual(['08:00', '17:00']);
    expect(hosts.filter(item => item.name === 'HeavyarChip').slice(-2).map(item => item.props.selected)).toEqual([true, false]);

    await completeDraft('B');
    await act(async () => submitButton()?.onPress());
    await settle();
    expect(effects.prepare).toHaveBeenCalledTimes(1);
    expect(effects.prepare.mock.calls[0][1]).toBe('account-b');
    expect(effects.prepare.mock.calls[0][0].workSite.instructions).toBe('Account B work site');
    expect(effects.create.mock.calls[0][3]).toBe('account-b');
    expect(JSON.stringify(effects.create.mock.calls[0][0])).not.toContain('Account A');
  });

  it('clears private state across logout and a subsequent login', async () => {
    await act(async () => root?.render(React.createElement(Screen)));
    await completeDraft('A');
    currentUser = null;
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Example: Riyadh')?.value).toBe('');
    expect(locationPicker()?.value).toBeNull();
    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Example: Riyadh')?.value).toBe('jeddah');
    expect(input('Short requirements without sensitive personal data')?.value).toBe('');
    expect(locationPicker()?.value).toBeNull();
  });

  it('ignores late preparation and persistence completions from Account A', async () => {
    const pendingPrepare = deferred<unknown>();
    effects.prepare.mockReturnValueOnce(pendingPrepare.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await completeDraft('A');
    await act(async () => submitButton()?.onPress());
    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await act(async () => pendingPrepare.resolve({ status: 'prepared_not_submitted' }));
    await settle();
    expect(effects.create).not.toHaveBeenCalled();
    expect(effects.replace).not.toHaveBeenCalled();

    currentUser = { uid: 'account-a', role: 'customer', countryCode: 'SA', region: 'riyadh' };
    hosts = [];
    effects.prepare.mockResolvedValue({ status: 'prepared_not_submitted' });
    const pendingCreate = deferred<any>();
    effects.create.mockReturnValueOnce(pendingCreate.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await completeDraft('A');
    await act(async () => submitButton()?.onPress());
    await settle();
    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await act(async () => pendingCreate.resolve({ rfq: { rfqId: `rfq_${'R'.repeat(43)}` } }));
    await settle();
    expect(effects.replace).not.toHaveBeenCalled();
  });

  it('preserves valid same-account draft and submission behavior', async () => {
    await act(async () => root?.render(React.createElement(Screen)));
    await completeDraft('A');
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Short requirements without sensitive personal data')?.value).toBe('Account A private notes');
    expect(locationPicker()?.value.instructions).toBe('Account A work site');
    await act(async () => submitButton()?.onPress());
    await settle();
    expect(effects.prepare.mock.calls[0][1]).toBe('account-a');
    expect(effects.create.mock.calls[0][3]).toBe('account-a');
    expect(effects.replace).toHaveBeenCalledTimes(1);
  });
});
