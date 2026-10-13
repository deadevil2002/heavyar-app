// @vitest-environment jsdom
import fs, { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const screen = fs.readFileSync('app/service-profile.tsx', 'utf8');
const service = fs.readFileSync('services/serviceProfileService.ts', 'utf8');
const profile = fs.readFileSync('app/(tabs)/profile/index.tsx', 'utf8');

describe('M2-D1 service-profile UI contract', () => {
  it('uses Heavyar Tamagui components with bilingual direction, accessible controls and full async states', () => {
    expect(screen).toMatch(/from ["']@\/components\/ui\/heavyar["']/);
    expect(screen).toContain('useHeavyarDirection');
    expect(screen).toContain('isRTL ? ar : en');
    expect(screen).toContain('ActivityIndicator');
    expect(screen).toContain('Retry');
    expect(screen).toContain('accessibilityLabel');
    expect(screen).toContain('accessibilityState');
    expect(screen).toContain('<AppDialog');
  });

  it('visibly separates declarations from verification and never claims publication or booking readiness', () => {
    expect(screen).toContain('Declared — unverified');
    expect(screen).toContain('does not enable public discovery or requests');
    expect(screen).toContain('does not establish transport authority');
    expect(service).toContain("verificationState: 'unverified'");
    expect(service).toContain('discoverable: false');
    expect(service).toContain('canReceiveRequests: false');
  });

  it('keeps account-switch isolation and exposes only the existing driver entry plus capability-scoped company entry', () => {
    expect(screen).toContain('contextEpoch.current += 1');
    expect(screen).toContain('saveController.current?.abort()');
    expect(service).toContain('true, expectedUid');
    expect(profile).toContain("route: '/service-profile'");
    expect(screen).not.toMatch(/firebase\/firestore|payment|commission|preciseLocation|latitude|longitude/);
  });
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  return {
    promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }),
    resolve,
    reject,
  };
}

const operatorProfile = (region: string, revision = 'operator-revision') => ({
  kind: 'operator', requestedCapability: 'operator', profileState: 'draft', moderationState: 'not_submitted',
  verificationState: 'unverified', discoverable: false, canReceiveRequests: false, revision, updatedAt: '2026-10-14T00:00:00.000Z',
  draft: {
    equipmentCategories: ['excavators'], yearsExperience: 8,
    serviceArea: { countryCode: 'SA', region, city: `${region} city` }, availability: 'available',
    declarations: [{ kind: 'qualification', title: `${region} credential`, declarationState: 'declared_unverified' }],
    description: `${region} operator`,
  },
});

const transporterProfile = (region: string, revision = 'transporter-revision') => ({
  kind: 'transporter', requestedCapability: 'transporter', profileState: 'draft', moderationState: 'not_submitted',
  verificationState: 'unverified', discoverable: false, canReceiveRequests: false, revision, updatedAt: '2026-10-14T00:00:00.000Z',
  draft: {
    vehicleCategory: 'lowbed', vehicleType: `${region} lowbed`, capacityKg: 50_000,
    dimensionsMm: { length: 12_000, width: 3_000, height: 4_000 },
    serviceArea: { countryCode: 'SA', region, city: `${region} city` }, availability: 'offline',
    declarations: [{ kind: 'transport_license', title: `${region} permit`, declarationState: 'declared_unverified' }],
    description: `${region} transport`,
  },
});

const effects = {
  getPersonal: vi.fn(),
  getOrganization: vi.fn(),
  savePersonal: vi.fn(),
  saveOrganization: vi.fn(),
};
let currentUser: { uid: string; role: string } | null = { uid: 'account-a', role: 'driver' };
let currentParams: { organizationId?: string; kind?: string } = {};
let hosts: { name: string; props: any }[] = [];
const moduleCache = new Map<string, any>();
const mobileRoot = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => { render: (element: React.ReactNode) => void; unmount: () => void };
};

const host = (name: string) => function Host(props: any) {
  hosts.push({ name, props });
  return React.createElement('div', { 'data-host': name }, props.children);
};

const heavyarHosts = Object.fromEntries([
  'HeavyarBadge', 'HeavyarBadgeText', 'HeavyarButton', 'HeavyarButtonText', 'HeavyarChip', 'HeavyarChipText',
  'HeavyarIconButton', 'HeavyarInput', 'HeavyarScreen', 'HeavyarSegment', 'HeavyarSegmentText',
  'HeavyarSegmentedControl', 'HeavyarSubtitle', 'HeavyarSurface', 'HeavyarTitle',
].map(name => [name, host(name)]));

function useTestDialog() {
  const [dialog, setDialog] = React.useState({ visible: false, title: '', message: '', buttons: [] as any[] });
  const showDialog = React.useCallback((title: string, message: string, buttons: any[]) => {
    setDialog({ visible: true, title, message, buttons });
  }, []);
  const hideDialog = React.useCallback(() => setDialog({ visible: false, title: '', message: '', buttons: [] }), []);
  return { dialog, showDialog, hideDialog };
}

function loadScreenModule(file: string): any {
  if (moduleCache.has(file)) return moduleCache.get(file);
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} as any };
  const mocks: Record<string, any> = {
    react: React,
    'react-native': {
      ActivityIndicator: host('ActivityIndicator'), KeyboardAvoidingView: host('KeyboardAvoidingView'),
      Platform: { OS: 'android' }, ScrollView: host('ScrollView'),
    },
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-router': {
      useLocalSearchParams: () => currentParams,
      useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
    },
    'lucide-react-native': new Proxy({}, { get: () => host('Icon') }),
    tamagui: { Text: host('Text'), XStack: host('XStack'), YStack: host('YStack') },
    '@/components/AppDialog': { __esModule: true, default: host('AppDialog') },
    '@/components/ui/heavyar': {
      ...heavyarHosts,
      useHeavyarDirection: () => ({ rowDirection: 'row', textAlign: 'left' }),
    },
    '@/hooks/useAppDialog': { useAppDialog: useTestDialog },
    '@/contexts/AuthContext': {
      useAuth: () => ({ user: currentUser, isAuthenticated: !!currentUser, isLoading: false }),
    },
    '@/contexts/LanguageContext': { useLanguage: () => ({ isRTL: false }) },
    '@/mocks/categories': { mockCategories: [{ id: 'excavators', nameAr: 'حفارات', nameEn: 'Excavators' }] },
    '@/services/serviceProfileService': {
      getPersonalServiceProfiles: effects.getPersonal,
      getOrganizationServiceProfile: effects.getOrganization,
      savePersonalServiceProfile: effects.savePersonal,
      saveOrganizationServiceProfile: effects.saveOrganization,
    },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    const resolved = id.startsWith('@/')
      ? path.join(mobileRoot, id.slice(2))
      : id.startsWith('.')
        ? path.resolve(path.dirname(file), id)
        : null;
    if (!resolved) throw new Error(`Unexpected service-profile dependency: ${id}`);
    const target = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find(existsSync);
    if (!target) throw new Error(`Missing service-profile dependency: ${id}`);
    return loadScreenModule(target);
  }, mod, mod.exports);
  moduleCache.set(file, mod.exports);
  return mod.exports;
}

function input(placeholder: string) {
  return hosts.findLast(item => item.name === 'HeavyarInput' && item.props.placeholder === placeholder)?.props;
}

function saveButton() {
  return hosts.findLast(item => item.name === 'HeavyarButton' && item.props.accessibilityLabel === 'Save service-profile draft')?.props;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('M2-D1 mounted account and organization isolation', () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let Screen: React.ComponentType;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    moduleCache.clear();
    hosts = [];
    currentUser = { uid: 'account-a', role: 'driver' };
    currentParams = {};
    Object.values(effects).forEach(mock => mock.mockReset());
    effects.getPersonal.mockResolvedValue({ operator: null, transporter: null });
    effects.getOrganization.mockResolvedValue(null);
    effects.savePersonal.mockResolvedValue(operatorProfile('saved'));
    effects.saveOrganization.mockResolvedValue(operatorProfile('saved'));
    Screen = loadScreenModule(path.join(mobileRoot, 'app/service-profile.tsx')).default;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('clears every Account A field before Account B with a null profile can render', async () => {
    const accountB = deferred<{ operator: null; transporter: null }>();
    effects.getPersonal.mockImplementation((uid: string) => uid === 'account-a'
      ? Promise.resolve({ operator: operatorProfile('Account A'), transporter: transporterProfile('Account A') })
      : accountB.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    expect(input('Region')?.value).toBe('Account A');
    expect(input('Qualification or permit title')?.value).toBe('Account A credential');

    currentUser = { uid: 'account-b', role: 'driver' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    expect(hosts.some(item => item.name === 'HeavyarInput' && String(item.props.value).includes('Account A'))).toBe(false);
    await act(async () => accountB.resolve({ operator: null, transporter: null }));
    await settle();
    expect(input('Region')?.value).toBe('');
    expect(input('Qualification or permit title')?.value).toBe('');
    expect(input('Short service description')?.value).toBe('');
  });

  it('clears Organization A and ignores its late response after switching to Organization B', async () => {
    const organizationA = deferred<any>();
    currentParams = { organizationId: `org_${'A'.repeat(43)}`, kind: 'operator' };
    effects.getOrganization.mockImplementation((_uid: string, organizationId: string) =>
      organizationId.includes('A') ? organizationA.promise : Promise.resolve(null));
    await act(async () => root?.render(React.createElement(Screen)));

    currentParams = { organizationId: `org_${'B'.repeat(43)}`, kind: 'operator' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    expect(input('Region')?.value).toBe('');
    await act(async () => organizationA.resolve(operatorProfile('Organization A')));
    await settle();
    expect(input('Region')?.value).toBe('');
    expect(input('Qualification or permit title')?.value).toBe('');
  });

  it('keeps operator and transporter forms isolated while switching service type', async () => {
    effects.getPersonal.mockResolvedValue({
      operator: operatorProfile('Operator Region'),
      transporter: transporterProfile('Transport Region'),
    });
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    expect(input('Region')?.value).toBe('Operator Region');
    expect(input('Vehicle type')).toBeUndefined();
    const segments = hosts.filter(item => item.name === 'HeavyarSegment');
    hosts = [];
    await act(async () => segments[1].props.onPress());
    expect(input('Vehicle type')?.value).toBe('Transport Region lowbed');
    expect(input('Region')?.value).toBe('Transport Region');
    const refreshedSegments = hosts.filter(item => item.name === 'HeavyarSegment');
    hosts = [];
    await act(async () => refreshedSegments[0].props.onPress());
    expect(input('Region')?.value).toBe('Operator Region');
    expect(input('Qualification or permit title')?.value).toBe('Operator Region credential');
    expect(effects.getPersonal).toHaveBeenCalledTimes(1);
  });

  it('ignores a previous account load that resolves after the current account', async () => {
    const accountA = deferred<any>();
    effects.getPersonal.mockImplementation((uid: string) => uid === 'account-a'
      ? accountA.promise
      : Promise.resolve({ operator: operatorProfile('Account B'), transporter: null }));
    await act(async () => root?.render(React.createElement(Screen)));
    currentUser = { uid: 'account-b', role: 'driver' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    expect(input('Region')?.value).toBe('Account B');
    await act(async () => accountA.resolve({ operator: operatorProfile('Late Account A'), transporter: null }));
    await settle();
    expect(input('Region')?.value).toBe('Account B');
  });

  it.each(['success', 'failure'] as const)('binds an in-flight save to Account A and emits no stale %s UI after switching to Account B', async outcome => {
    const saving = deferred<any>();
    effects.getPersonal.mockImplementation((uid: string) => Promise.resolve(uid === 'account-a'
      ? { operator: operatorProfile('Account A'), transporter: null }
      : { operator: null, transporter: null }));
    effects.savePersonal.mockReturnValue(saving.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    const button = saveButton();
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button.onPress();
      button.onPress();
    });
    expect(effects.savePersonal).toHaveBeenCalledTimes(1);
    expect(effects.savePersonal.mock.calls[0][0]).toBe('account-a');
    expect(effects.savePersonal.mock.calls[0][1]).toBe('operator');

    currentUser = { uid: 'account-b', role: 'driver' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    await act(async () => outcome === 'success'
      ? saving.resolve(operatorProfile('Committed for Account A'))
      : saving.reject(new Error('save failed after context switch')));
    await settle();
    expect(input('Region')?.value).toBe('');
    expect(hosts.some(item => item.name === 'AppDialog' && item.props.visible)).toBe(false);
    expect(effects.savePersonal).toHaveBeenCalledTimes(1);
  });

  it('never retargets an Organization A save after navigating to Organization B', async () => {
    const organizationA = `org_${'A'.repeat(43)}`;
    const organizationB = `org_${'B'.repeat(43)}`;
    const saving = deferred<any>();
    currentParams = { organizationId: organizationA, kind: 'operator' };
    effects.getOrganization.mockImplementation((_uid: string, organizationId: string) => Promise.resolve(
      organizationId === organizationA ? operatorProfile('Organization A') : null,
    ));
    effects.saveOrganization.mockReturnValue(saving.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    const button = saveButton();
    expect(button?.disabled).toBe(false);
    await act(async () => button.onPress());
    expect(effects.saveOrganization.mock.calls[0][0]).toBe('account-a');
    expect(effects.saveOrganization.mock.calls[0][1]).toBe(organizationA);
    expect(effects.saveOrganization.mock.calls[0][2]).toBe('operator');

    currentParams = { organizationId: organizationB, kind: 'operator' };
    hosts = [];
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    await act(async () => saving.resolve(operatorProfile('Committed for Organization A')));
    await settle();
    expect(input('Region')?.value).toBe('');
    expect(hosts.some(item => item.name === 'AppDialog' && item.props.visible)).toBe(false);
    expect(effects.saveOrganization).toHaveBeenCalledTimes(1);
  });

  it('does not commit stale UI after unmount during load or save and preserves normal editing', async () => {
    const loading = deferred<any>();
    effects.getPersonal.mockReturnValueOnce(loading.promise);
    await act(async () => root?.render(React.createElement(Screen)));
    hosts = [];
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => loading.resolve({ operator: operatorProfile('Unmounted Load'), transporter: null }));
    await settle();
    expect(hosts).toHaveLength(0);

    moduleCache.clear();
    hosts = [];
    effects.getPersonal.mockReset().mockResolvedValue({ operator: operatorProfile('Editable'), transporter: null });
    const save = deferred<any>();
    effects.savePersonal.mockReset().mockReturnValue(save.promise);
    Screen = loadScreenModule(path.join(mobileRoot, 'app/service-profile.tsx')).default;
    root = createRoot(document.createElement('div'));
    await act(async () => root?.render(React.createElement(Screen)));
    await settle();
    const region = input('Region');
    hosts = [];
    await act(async () => region?.onChangeText('Edited Region'));
    const button = saveButton();
    expect(button).toBeTruthy();
    await act(async () => button.onPress());
    expect(effects.savePersonal.mock.calls[0][4]).toBeInstanceOf(AbortSignal);
    expect(effects.savePersonal.mock.calls[0][3].serviceArea.region).toBe('Edited Region');
    hosts = [];
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => save.resolve(operatorProfile('Saved After Unmount')));
    await settle();
    expect(hosts).toHaveLength(0);
  });
});
