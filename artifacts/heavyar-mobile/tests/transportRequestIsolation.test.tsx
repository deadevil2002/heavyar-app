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
let hosts: { name: string; props: any }[] = [];
const effects = { prepare: vi.fn() };
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
  const file = path.join(mobileRoot, 'app/transport-request-prepare.tsx');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as any };
  const stack = host('Stack');
  const mocks: Record<string, any> = {
    react: React,
    'react-native': { KeyboardAvoidingView: host('KeyboardAvoidingView'), Platform: { OS: 'android' }, ScrollView: host('ScrollView') },
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-router': { useRouter: () => ({ back: vi.fn() }) },
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
    '@/services/transporterService': { prepareTransportRequest: effects.prepare },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected transport-request dependency: ${id}`);
  }, mod, mod.exports);
  return mod.exports.default;
}

function input(placeholder: string) {
  return hosts.findLast(item => item.name === 'HeavyarInput' && item.props.placeholder === placeholder)?.props;
}
function inputs(placeholder: string, count: number) {
  return hosts.filter(item => item.name === 'HeavyarInput' && item.props.placeholder === placeholder).slice(-count).map(item => item.props);
}
function locationPickers() {
  return hosts.filter(item => item.name === 'LocationPicker').slice(-2).map(item => item.props);
}
function submitButton() {
  return hosts.findLast(item => item.name === 'HeavyarButton')?.props;
}
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function completeMinimumDraft() {
  await act(async () => {
    input('Delivery region')?.onChangeText('eastern');
    const [origin, destination] = locationPickers();
    origin.onConfirm({ lat: 24.7, lng: 46.6, instructions: 'Account A pickup' });
    destination.onConfirm({ lat: 26.4, lng: 50.1, instructions: 'Account A delivery' });
  });
}

describe('M2-D3 transport-request account isolation', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let Screen: React.ComponentType;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    currentUser = { uid: 'account-a', role: 'customer', countryCode: 'SA', region: 'riyadh' };
    hosts = [];
    effects.prepare.mockReset().mockResolvedValue({ status: 'prepared_not_submitted' });
    Screen = loadScreen();
    root = createRoot(document.createElement('div'));
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('synchronously replaces every private Account A draft value with Account B defaults', async () => {
    await act(async () => root?.render(React.createElement(Screen)));
    await act(async () => {
      input('Weight in kg')?.onChangeText('22222');
      input('Length mm')?.onChangeText('9999');
      input('Width mm')?.onChangeText('3333');
      input('Height mm')?.onChangeText('4444');
      input('Pickup region')?.onChangeText('private-origin');
      input('Delivery region')?.onChangeText('private-destination');
      input('Short operational notes without sensitive data')?.onChangeText('Account A private notes');
      const [pickupDate, deliveryDate] = inputs('YYYY-MM-DD', 2);
      const [pickupStart, pickupEnd, deliveryTime] = inputs('HH:mm', 3);
      pickupDate.onChangeText('2099-01-01'); deliveryDate.onChangeText('2099-01-03');
      pickupStart.onChangeText('01:00'); pickupEnd.onChangeText('02:00'); deliveryTime.onChangeText('03:00');
      hosts.filter(item => item.name === 'HeavyarChip').slice(-2)[1].props.onPress();
      const [origin, destination] = locationPickers();
      origin.onConfirm({ lat: 24.7, lng: 46.6, instructions: 'Account A pickup' });
      destination.onConfirm({ lat: 26.4, lng: 50.1, instructions: 'Account A delivery' });
    });
    await act(async () => submitButton()?.onPress());
    await settle();
    expect(JSON.stringify(hosts.filter(item => item.name === 'Text').map(item => item.props.children))).toContain('Requirements are valid');
    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Weight in kg')?.value).toBe('10000');
    expect(input('Length mm')?.value).toBe('8000');
    expect(input('Width mm')?.value).toBe('2500');
    expect(input('Height mm')?.value).toBe('3000');
    expect(input('Pickup region')?.value).toBe('jeddah');
    expect(input('Delivery region')?.value).toBe('');
    expect(input('Short operational notes without sensitive data')?.value).toBe('');
    expect(locationPickers().map(item => item.value)).toEqual([null, null]);
    expect(inputs('YYYY-MM-DD', 2).map(item => item.value)).not.toContain('2099-01-01');
    expect(inputs('YYYY-MM-DD', 2).map(item => item.value)).not.toContain('2099-01-03');
    expect(inputs('HH:mm', 3).map(item => item.value)).toEqual(['08:00', '10:00', '17:00']);
    expect(hosts.filter(item => item.name === 'HeavyarChip').slice(-2).map(item => item.props.selected)).toEqual([true, false]);
    expect(JSON.stringify(hosts.filter(item => item.name === 'Text').map(item => item.props.children))).not.toContain('Requirements are valid');
  });

  it('binds an in-flight preparation to Account A and ignores its late response after switching or logout', async () => {
    const pending = deferred<unknown>();
    effects.prepare.mockReturnValue(pending.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await completeMinimumDraft();
    await act(async () => submitButton()?.onPress());
    expect(effects.prepare.mock.calls[0][1]).toBe('account-a');
    currentUser = { uid: 'account-b', role: 'customer', countryCode: 'SA', region: 'jeddah' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await act(async () => pending.resolve({ status: 'prepared_not_submitted' }));
    await settle();
    expect(JSON.stringify(hosts.filter(item => item.name === 'Text').map(item => item.props.children))).not.toContain('Requirements are valid');
    expect(locationPickers().map(item => item.value)).toEqual([null, null]);
    currentUser = null;
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(input('Delivery region')?.value).toBe('');
    expect(locationPickers().map(item => item.value)).toEqual([null, null]);
  });

  it('preserves normal same-account preparation behavior', async () => {
    await act(async () => root?.render(React.createElement(Screen)));
    await completeMinimumDraft();
    await act(async () => submitButton()?.onPress());
    await settle();
    expect(effects.prepare).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(hosts.filter(item => item.name === 'Text').map(item => item.props.children))).toContain('Requirements are valid');
  });
});
