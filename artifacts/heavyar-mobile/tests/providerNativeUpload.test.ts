import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { MutationError } from '../services/mutationError';
import { safeErrorMessage } from '../services/errorMessages';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../../');
const mobile = path.resolve(import.meta.dirname, '..');
const babel = require('@babel/core');
const store = path.join(root, 'node_modules/.pnpm');
const flow = readdirSync(store).find(name => name.startsWith('@babel+plugin-transform-flow-strip-types@'))!;
// Execute the installed RN implementation, not a browser FormData stand-in.
const nativeSource = readFileSync(path.join(mobile, 'node_modules/react-native/Libraries/Network/FormData.js'), 'utf8');
const compiled = babel.transformSync(nativeSource, { configFile: false, babelrc: false,
  plugins: [require(path.join(store, flow, 'node_modules/@babel/plugin-transform-flow-strip-types'))] }).code;
const NativeFormData = new Function(`${compiled.replace('export default FormData;', '')}; return FormData;`)();
function service(auth = { currentUser: { uid: 'qa', getIdToken: async (_force?: boolean) => 'test-only' } }) {
  const source = ts.transpileModule(readFileSync(path.join(mobile, 'services/cloudinaryService.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  new Function('require', 'exports', source)((id: string) => ({
    './firebaseConfig': { getFirebaseAuth: () => auth },
    '@/constants/worker': { WORKER_BASE_URL: 'https://worker.test' },
    'react-native': { Platform: { OS: 'android' } },
    './mutationError': { MutationError },
  }[id]), exports);
  return exports;
}
afterEach(() => vi.unstubAllGlobals());
describe('installed Android multipart contract', () => {
  it('reproduces the old Blob part lacking the uri Android requires', () => {
    const form = new NativeFormData();
    form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'upload.jpg');
    expect(form.getParts()[0].uri).toBeUndefined();
    expect(form.getParts()[0].string).toBeUndefined();
    const bridge = readFileSync(path.join(mobile, 'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/NetworkingModule.kt'), 'utf8');
    expect(bridge).toContain('Unrecognized FormData part.');
  });
  it.each(['file:///cache/photo.jpg', 'content://media/photo/123'])('sends a native URI part for %s', async uri => {
    vi.stubGlobal('FormData', NativeFormData);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === uri) return new Response(new Blob(['photo'], { type: 'image/jpeg' }));
      const part = (init!.body as any).getParts()[0];
      expect(part.uri).toBe(uri);
      expect(part.headers['content-type']).toBe('image/jpeg');
      expect(part.headers['content-disposition']).toContain('filename=');
      return new Response(JSON.stringify({ success: true, url: 'https://res.cloudinary.com/qa/image/upload/a.jpg', publicId: 'heavyar/qa/a' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await service().uploadImageToCloudinary(uri)).publicId).toBe('heavyar/qa/a');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('preserves server request ID and masks upstream details', async () => {
    vi.stubGlobal('FormData', NativeFormData);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(new Blob(['x'], { type: 'image/png' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 'PRIVATE_FAILURE', error: 'private details' }), { status: 502, headers: { 'X-Request-ID': 'ABC1234567' } })));
    const error = await service().uploadImageToCloudinary('file:///a.png').catch((e: unknown) => e);
    expect(safeErrorMessage(error, 'en')).toContain('Support code: ABC1234567');
    expect(safeErrorMessage(error, 'en')).not.toContain('private details');
  });
  it('local failures have explicitly client-only support codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private path')));
    await expect(service().uploadImageToCloudinary('file:///a.jpg')).rejects.toMatchObject({ supportCode: 'CLIENT-IMAGE-READ-FAILED' });
    expect(safeErrorMessage({ supportCode: '<private>' }, 'en')).not.toContain('<private>');
  });
  it.each(['token', '401', 'success', 'refresh'])('pins upload identity when account changes during %s', async phase => {
    vi.stubGlobal('FormData', NativeFormData);
    const other = { uid: 'other', getIdToken: vi.fn(async () => 'other-token') };
    const auth = { currentUser: { uid: 'qa', getIdToken: vi.fn(async (force?: boolean) => {
      if (phase === 'token' || (phase === 'refresh' && force)) auth.currentUser = other;
      return 'original-token';
    }) } };
    const close = vi.fn();
    const mock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return { blob: async () => ({ type: 'image/jpeg', size: 1, close }) };
      expect(close).toHaveBeenCalledOnce();
      expect((init.headers as any).Authorization).toBe('Bearer original-token');
      if (phase === '401' || phase === 'success') auth.currentUser = other;
      return Response.json({ success: true, url: 'https://res.cloudinary.com/qa/image/upload/a.jpg', publicId: 'heavyar/qa/a' }, { status: phase === 'success' ? 200 : 401 });
    });
    vi.stubGlobal('fetch', mock);
    await expect(service(auth).uploadImageToCloudinary('file:///a.jpg')).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    expect(other.getIdToken).not.toHaveBeenCalled();
    expect(mock).toHaveBeenCalledTimes(phase === 'token' ? 1 : 2);
    expect(close).toHaveBeenCalledOnce();
  });
  it('upload network exceptions have a client-only support code', async () => {
    vi.stubGlobal('FormData', NativeFormData);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(new Blob(['x'], { type: 'image/jpeg' })))
      .mockRejectedValueOnce(new TypeError('Network request failed')));
    await expect(service().uploadImageToCloudinary('file:///a.jpg')).rejects.toMatchObject({ supportCode: 'CLIENT-UPLOAD-NETWORK-UNAVAILABLE' });
  });
  it.each(['file:///a.jpg', 'content://media/123'])('enforces actual 10MiB blob size for %s before upload', async uri => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => ({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }) }));
    await expect(service().uploadImageToCloudinary(uri)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['file:///a.png', 'application/octet-stream', 'image/png'],
    ['content://media/123', 'image/heic', 'image/heic'],
  ])('accepts exactly 10MiB with supported metadata for %s', async (uri, metadata, mime) => {
    vi.stubGlobal('FormData', NativeFormData);
    const mock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return { blob: async () => ({ type: metadata, size: 10 * 1024 * 1024 }) };
      expect((init.body as any).getParts()[0].headers['content-type']).toBe(mime);
      return new Response(JSON.stringify({ success: true, url: 'https://res.cloudinary.com/qa/image/upload/a.jpg', publicId: 'heavyar/qa/a' }));
    });
    vi.stubGlobal('fetch', mock);
    await expect(service().uploadImageToCloudinary(uri)).resolves.toMatchObject({ publicId: 'heavyar/qa/a' });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['file:///a.gif', 'image/gif', 1],
    ['file:///a.jpg', 'text/html', 1],
    ['content://media/123', '', 1],
    ['file:///a.jpg', 'image/jpeg', 0],
    ['file:///a.jpg', 'image/jpeg', NaN],
  ])('fails closed for unsupported metadata %s/%s/%s', async (uri, type, size) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => ({ type, size }) }));
    await expect(service().uploadImageToCloudinary(uri)).rejects.toBeInstanceOf(MutationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('upload progress callback failures cannot trigger media cleanup', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('FormData', NativeFormData);
    const mock = vi.fn().mockResolvedValueOnce(new Response(new Blob(['x'], { type: 'image/jpeg' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, url: 'https://res.cloudinary.com/qa/image/upload/a.jpg', publicId: 'heavyar/qa/a' })));
    vi.stubGlobal('fetch', mock);
    const images = await service().uploadMultipleImages(['file:///a.jpg'], () => { throw new Error('observer'); });
    expect(images).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});