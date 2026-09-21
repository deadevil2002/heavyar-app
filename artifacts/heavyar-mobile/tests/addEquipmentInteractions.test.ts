import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Run the actual TSX through React, with native hosts replaced by inert DOM hosts.
// This measures React work, not Android frames or real network latency.
const require = createRequire(import.meta.url);
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => { render: (element: React.ReactNode) => void; unmount: () => void };
};
const mobile = path.resolve(import.meta.dirname, '..');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });

const effects = { create: vi.fn(), upload: vi.fn(), fetch: vi.fn(), deleteImage: vi.fn() };
const renders: Record<string, number> = {};
let hosts: { name: string; props: any }[] = [];
const host = (name: string) => function Host(props: any) {
  renders[name] = (renders[name] || 0) + 1;
  hosts.push({ name, props });
  return React.createElement('div', null, props.children);
};
const native = Object.fromEntries(['View', 'Text', 'TextInput', 'Pressable', 'ScrollView', 'Switch', 'ActivityIndicator'].map(name => [name, host(name)]));
const t = (key: string) => key;
const localizedText = (_ar: string, en: string) => en;
let user = { uid: 'provider-a', role: 'provider', nativeCurrency: 'SAR', countryCode: 'SA' };
const cache = new Map<string, any>();
function load(file: string): any {
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const mocks: Record<string, any> = {
    react: React,
    'react-native': { ...native, StyleSheet: { create: (v: any) => v } },
    'react-native-safe-area-context': { SafeAreaView: host('SafeAreaView') },
    'expo-image': { Image: host('Image') },
    'lucide-react-native': new Proxy({}, { get: () => host('Icon') }),
    'expo-image-picker': {
      requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///local-equipment.jpg' }] }),
    },
    'expo-router': { useRouter: () => ({ push: vi.fn() }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t, localizedText, isRTL: false }) },
    '@/contexts/AuthContext': { useAuth: () => ({ user, isAuthenticated: true, requiresEmailVerification: () => false }) },
    '@/services/workerClient': { createListing: effects.create },
    '@/services/cloudinaryService': { uploadMultipleImages: effects.upload, deleteCloudinaryImage: effects.deleteImage },
    '@/components/AppDialog': { __esModule: true, default: host('Dialog') },
    '@/utils/mobilePerformance': { mobilePerformance: { countRender: (label: string) => { renders[label] = (renders[label] || 0) + 1; }, startPress: () => ({ visible() {} }) } },
  };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in mocks) return mocks[id];
    const resolved = id.startsWith('@/') ? path.join(mobile, id.slice(2)) : id.startsWith('.') ? path.resolve(path.dirname(file), id) : null;
    if (!resolved) throw new Error(`Unexpected dependency in local interaction: ${id}`);
    const target = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find(existsSync)!;
    return load(target);
  }, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });

describe('Add Equipment local interaction isolation', () => {
  it.each([
    { supportCode: null, code: '', status: 0, ambiguous: false },
    { supportCode: 'ABCDEF1234', code: 'INVALID_LISTING', status: 400, ambiguous: false },
    { supportCode: '<private>', code: 'FORBIDDEN', status: 403, ambiguous: false },
    { supportCode: 'CLIENT-NETWORK-TIMEOUT', code: 'NETWORK_TIMEOUT', status: 0, ambiguous: true },
    { supportCode: 'CLIENT-NETWORK-UNAVAILABLE', code: 'NETWORK_UNAVAILABLE', status: 0, ambiguous: true },
    { supportCode: 'ABCDEF1234', code: 'INTERNAL_ERROR', status: 500, ambiguous: true },
    { supportCode: 'CLIENT-AUTH-SESSION-CHANGED', code: 'AUTH_SESSION_CHANGED', status: 401, ambiguous: true },
    { supportCode: null, code: 'SWITCH_DURING_UPLOAD', status: 0, ambiguous: false },
    { supportCode: null, code: 'SWITCH_DURING_CREATE', status: 0, ambiguous: false },
  ])('isolates local edits, exact pricing and cleanup ($code)', async ({ supportCode, code, status, ambiguous }) => {
    cache.clear();
    user = { ...user, uid: 'provider-a' };
    hosts = [];
    Object.values(effects).forEach(fn => fn.mockClear());
    vi.stubGlobal('fetch', effects.fetch);
    const Screen = load(path.join(mobile, 'app/(tabs)/add/index.tsx')).default;
    root = createRoot(document.createElement('div'));
    await act(() => root!.render(React.createElement(Screen)));
    const price = hosts.findLast(h => h.name === 'TextInput' && h.props.keyboardType === 'decimal-pad');
    const title = hosts.findLast(h => h.name === 'TextInput' && h.props.placeholder === 'title_ar');
    const district = hosts.findLast(h => h.name === 'TextInput' && h.props.placeholder === 'district_name');
    const imageButton = hosts.find(h => h.name === 'Pressable' && h.props.children?.[1]?.props?.children === 'add_images');
    const pressContaining = async (text: string) => {
      const textOf = (node: any): string => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.props?.children);
      const button = hosts.findLast(h => h.name === 'Pressable' && textOf(h.props.children).includes(text));
      expect(button, text).toBeTruthy();
      hosts = [];
      Object.keys(renders).forEach(key => delete renders[key]);
      await act(async () => {
        const first = button!.props.onPress();
        if (text === 'publish') await button!.props.onPress();
        await first;
      });
      console.info('ADD_EQUIPMENT_SELECTION', text, JSON.stringify(renders));
    };
    await pressContaining('select_category');
    await pressContaining('Excavators');
    await pressContaining('select_region');
    await pressContaining('Eastern Region');
    await pressContaining('select_city');
    expect(price).toBeTruthy();
    Object.keys(renders).forEach(key => delete renders[key]);
    await act(() => price!.props.onChangeText('123.45'));
    console.info('ADD_EQUIPMENT_PRICE_RENDER_MEASUREMENT', JSON.stringify(renders));
    expect(effects.create).not.toHaveBeenCalled();
    expect(effects.upload).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
    // Once isolated, a price keystroke must not revisit the screen or pickers.
    expect(renders['AddEquipment.Pricing']).toBe(1);
    expect(renders.AddEquipment || 0).toBe(0);
    expect(renders.Pressable || 0).toBe(0);
    expect(renders.Image || 0).toBe(0);
    expect(renders.TextInput).toBe(1);
    const toggle = hosts.find(h => h.name === 'Switch' && h.props.accessibilityLabel === 'Hourly price');
    Object.keys(renders).forEach(key => delete renders[key]);
    await act(() => toggle!.props.onValueChange(true));
    expect(renders.AddEquipment || 0).toBe(0);
    expect(effects.create).not.toHaveBeenCalled();
    expect(effects.upload).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
    // Turn the extra rate back off, preserving daily exact decimal input.
    const hourly = hosts.findLast(h => h.name === 'Switch' && h.props.accessibilityLabel === 'Hourly price');
    await act(() => hourly!.props.onValueChange(false));
    const citySearch = hosts.findLast(h => h.name === 'TextInput' && h.props.placeholder === 'search_city');
    await act(() => citySearch!.props.onChangeText('dam'));
    await act(() => district!.props.onChangeText('Local district'));
    await act(() => title!.props.onChangeText('حفار اختبار'));
    await pressContaining('Dammam');
    expect(effects.create).not.toHaveBeenCalled();
    expect(effects.upload).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
    const uploaded = [{ publicId: 'equipment/test', url: 'https://res.cloudinary.com/test/image/upload/equipment/test.jpg' }];
    effects.upload.mockResolvedValue(uploaded);
    if (supportCode) effects.create.mockRejectedValue({ supportCode, code, status, message: 'private internal data' });
    else effects.create.mockResolvedValue({ id: 'test' });
    // ImagesSection is memoized, so its original handler is still live.
    expect(imageButton).toBeTruthy();
    await act(() => imageButton!.props.onPress());
    if (code.startsWith('SWITCH_')) {
      let release!: (value: any) => void;
      const pending = new Promise(resolve => { release = resolve; });
      if (code === 'SWITCH_DURING_UPLOAD') effects.upload.mockReturnValue(pending);
      else effects.create.mockReturnValue(pending);
      const button = hosts.findLast(h => h.name === 'Pressable' && h.props.disabled === false);
      expect(button).toBeTruthy();
      let submission!: Promise<void>;
      await act(async () => {
        submission = button!.props.onPress();
        await button!.props.onPress();
      });
      expect(effects.upload).toHaveBeenCalledTimes(1);
      expect(effects.upload.mock.calls[0][2]).toBe('provider-a');
      user = { ...user, uid: 'provider-b' };
      hosts = [];
      await act(() => root!.render(React.createElement(Screen)));
      const newTitle = hosts.findLast(h => h.name === 'TextInput' && h.props.placeholder === 'title_ar');
      const newPrice = hosts.findLast(h => h.name === 'TextInput' && h.props.keyboardType === 'decimal-pad');
      expect(newTitle!.props.value).toBe('');
      expect(newPrice!.props.value).toBe('');
      expect(hosts.filter(h => h.name === 'Image')).toHaveLength(0);
      await act(() => newTitle!.props.onChangeText('Provider B draft'));
      hosts = [];
      await act(async () => {
        release(code === 'SWITCH_DURING_UPLOAD' ? uploaded : { id: 'committed-for-a' });
        await submission;
      });
      expect(hosts).toHaveLength(0); // no stale state or dialog commits
      expect(effects.create).toHaveBeenCalledTimes(code === 'SWITCH_DURING_UPLOAD' ? 0 : 1);
      if (code === 'SWITCH_DURING_CREATE') expect(effects.create.mock.calls[0][1]).toBe('provider-a');
      expect(effects.deleteImage).not.toHaveBeenCalled();
      return;
    }
    await pressContaining('publish');
    expect(effects.upload).toHaveBeenCalledTimes(1);
    expect(effects.create).toHaveBeenCalledTimes(1);
    expect(effects.upload).toHaveBeenCalledWith(['file:///local-equipment.jpg'], expect.any(Function), 'provider-a');
    expect(effects.create.mock.calls[0][1]).toBe('provider-a');
    expect(effects.create.mock.calls[0][0]).toMatchObject({
      titleAr: 'حفار اختبار', titleEn: 'حفار اختبار',
      region: 'eastern', city: 'dammam', district: 'Local district', location: { lat: 0, lng: 0 },
      pricingModelVersion: 2,
      pricing: { currency: 'SAR', daily: { enabled: true, amountMinor: 12345 }, hourly: { enabled: false, amountMinor: 0 } },
      images: uploaded,
    });
    const dialog = hosts.findLast(h => h.name === 'Dialog' && h.props.visible);
    expect(dialog).toBeTruthy();
    if (supportCode === 'ABCDEF1234') expect(dialog!.props.message).toContain('Support code: ABCDEF1234');
    if (supportCode === '<private>') expect(dialog!.props.message).not.toContain('<private>');
    expect(dialog!.props.message).not.toContain('private internal data');
    if (ambiguous) {
      expect(effects.deleteImage).not.toHaveBeenCalled();
      expect(dialog!.props.message).toContain('Check your listings before trying again.');
      expect(effects.create).toHaveBeenCalledTimes(1);
    } else if (supportCode) {
      expect(effects.deleteImage).toHaveBeenCalledExactlyOnceWith('equipment/test');
    } else {
      expect(effects.deleteImage).not.toHaveBeenCalled();
    }
  });
});