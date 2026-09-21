// Isolated actual-service fixture: no Firebase, native runtime, or network.
// Run: node --test tests/cloudinaryConcurrency.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { performance } = require('node:perf_hooks');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const uris = [1, 2, 3, 4].map(id => `file:///${id}.jpg`);

function fixture(options = {}) {
  const state = { reads: [], uploads: [], deletes: [], closed: 0, active: 0, peak: 0, refreshes: 0 };
  const user = { uid: 'fixture', getIdToken: async refresh => {
    if (refresh) state.refreshes++;
    if (options.token) return options.token({ refresh, state, auth });
    return 'fixture-token';
  } };
  const auth = { currentUser: user };
  const transport = async (url, init) => {
    if (url.startsWith('file:')) {
      state.reads.push(url);
      const id = Number(url.match(/(\d+)\./)[1]);
      return { blob: async () => ({
        type: options.mime || 'image/jpeg', size: options.size ?? 123,
        close: () => state.closed++, id,
      }) };
    }
    if (url.endsWith('/delete')) {
      state.deletes.push({ ...JSON.parse(init.body), active: state.active, token: init.headers.Authorization });
      return new Response(JSON.stringify({ success: true }));
    }
    assert.equal(url, 'https://fixture.invalid/cloudinary/upload');
    const file = init.body.file;
    const id = Number(file.uri.match(/(\d+)\./)[1]);
    state.uploads.push(id);
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    try {
      if (options.upload) {
        const response = await options.upload({ id, state, auth });
        if (response) return response;
      } else await delay(5);
      return new Response(JSON.stringify({
        success: true, url: `https://res.cloudinary.com/fixture/image/upload/${id}.jpg`,
        publicId: `heavyar/fixture/${id}`,
      }));
    } finally { state.active--; }
  };
  const load = (relative, deps) => {
    const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    const compiled = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    assert.deepEqual(compiled.diagnostics, []);
    const exports = {};
    new Function('require', 'exports', 'fetch', 'FormData', 'console', compiled.outputText)(
      name => { assert.ok(name in deps, name); return deps[name]; }, exports, transport,
      class { append(name, value) { this[name] = value; } }, { warn() {} },
    );
    return exports;
  };
  const mutation = load('services/mutationError.ts', {});
  const media = load('services/cloudinaryService.ts', {
    './firebaseConfig': { getFirebaseAuth: () => auth },
    '@/constants/worker': { WORKER_BASE_URL: 'https://fixture.invalid' },
    'react-native': { Platform: { OS: 'android' } },
    './mutationError': mutation,
  });
  return { ...media, state, auth };
}
const codeIs = code => error => error.code === code;

test('max two operations, input ordering despite completion order, progress and native blob close', async () => {
  const f = fixture({ upload: async ({ id }) => { await delay(id === 1 ? 30 : 5); } });
  const progress = [];
  const images = await f.uploadMultipleImages(uris, (n, total) => progress.push([n, total]), 'fixture');
  assert.deepEqual(images.map(i => i.publicId), [1, 2, 3, 4].map(i => `heavyar/fixture/${i}`));
  assert.deepEqual(progress, [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.equal(f.state.peak, 2);
  assert.equal(f.state.closed, 4);
});

test('first failure stops new work, waits for delayed success, then cleans all known successes', async () => {
  const f = fixture({ upload: async ({ id }) => {
    await delay(id === 2 ? 35 : 5);
    if (id === 3) return new Response(JSON.stringify({ errorCode: 'UPLOAD_FAILED' }), { status: 500 });
  } });
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('UPLOAD_FAILED'));
  assert.deepEqual(f.state.uploads, [1, 2, 3]);
  assert.deepEqual(f.state.deletes.map(i => i.publicId).sort(), ['heavyar/fixture/1', 'heavyar/fixture/2']);
  assert.ok(f.state.deletes.every(i => i.active === 0 && i.token === 'Bearer fixture-token'));
});

test('immediate failure awaits the other upload and preserves first error', async () => {
  const f = fixture({ upload: async ({ id }) => {
    await delay(id === 1 ? 1 : 30);
    return new Response(JSON.stringify({ errorCode: id === 1 ? 'FIRST' : 'SECOND' }), { status: 500 });
  } });
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('FIRST'));
  assert.equal(f.state.active, 0);
  assert.deepEqual(f.state.uploads, [1, 2]);
  assert.equal(f.state.deletes.length, 0);
});

test('account switch during uploads prevents new work and all rollback', async () => {
  const f = fixture({ upload: async ({ id, auth }) => {
    await delay(id === 1 ? 5 : 25);
    if (id === 1) auth.currentUser = { uid: 'other', getIdToken: async () => 'other-token' };
  } });
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('AUTH_SESSION_CHANGED'));
  assert.deepEqual(f.state.uploads, [1, 2]);
  assert.equal(f.state.active, 0);
  assert.equal(f.state.deletes.length, 0);
});

test('account switch while acquiring cleanup token never sends deletion', async () => {
  let tokens = 0;
  const f = fixture({
    token: async ({ auth }) => {
      if (++tokens > 2) {
        await delay(1);
        auth.currentUser = { uid: 'other', getIdToken: async () => 'other-token' };
      }
      return 'fixture-token';
    },
    upload: async ({ id }) => {
      await delay(id === 1 ? 1 : 10);
      if (id === 2) return new Response('{}', { status: 500 });
    },
  });
  await assert.rejects(f.uploadMultipleImages(uris.slice(0, 2)), codeIs('UPLOAD_FAILED'));
  assert.equal(tokens, 3);
  assert.equal(f.state.deletes.length, 0);
});

test('401 refresh retries only failed request, never re-reads image, progress once', async () => {
  const f = fixture({ upload: async ({ id, state }) => {
    await delay(5);
    if (state.uploads.filter(n => n === id).length === 1) return new Response('{}', { status: 401 });
  } });
  const progress = [];
  await f.uploadMultipleImages(uris, n => progress.push(n));
  assert.equal(f.state.uploads.length, 8);
  assert.equal(f.state.reads.length, 4);
  assert.equal(f.state.closed, 4);
  assert.equal(f.state.refreshes, 4);
  assert.equal(f.state.peak, 2);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test('session switch during refresh prevents retry and cleanup', async () => {
  const f = fixture({
    token: async ({ refresh, auth }) => {
      if (refresh) auth.currentUser = { uid: 'other' };
      return 'fixture-token';
    },
    upload: async () => new Response('{}', { status: 401 }),
  });
  await assert.rejects(f.uploadMultipleImages(uris.slice(0, 1)), codeIs('AUTH_SESSION_CHANGED'));
  assert.equal(f.state.uploads.length, 1);
  assert.equal(f.state.deletes.length, 0);
});

test('terminal 401 is not retried indefinitely and a later batch starts with fresh state', async () => {
  let fail = true;
  const f = fixture({ upload: async () => {
    if (fail) return new Response('{}', { status: 401 });
  } });
  await assert.rejects(f.uploadMultipleImages(uris.slice(0, 1)), codeIs('UPLOAD_FAILED'));
  assert.equal(f.state.uploads.length, 2);
  assert.equal(f.state.refreshes, 1);
  fail = false;
  const progress = [];
  const images = await f.uploadMultipleImages(uris, n => progress.push(n));
  assert.deepEqual(images.map(i => i.publicId), [1, 2, 3, 4].map(i => `heavyar/fixture/${i}`));
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test('invalid success response never contributes an untrusted cleanup identifier', async () => {
  const f = fixture({ upload: async ({ id }) => {
    await delay(id === 1 ? 1 : 15);
    if (id === 1) return new Response(JSON.stringify({
      url: 'https://res.cloudinary.com/fixture/image/upload/1.jpg',
      publicId: 'heavyar/other/1',
    }));
  } });
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('INVALID_UPLOAD_RESPONSE'));
  assert.deepEqual(f.state.uploads, [1, 2]);
  assert.deepEqual(f.state.deletes.map(i => i.publicId), ['heavyar/fixture/2']);
});

test('network ambiguity is not retried; only acknowledged sibling is cleaned', async () => {
  const f = fixture({ upload: async ({ id }) => {
    await delay(id === 1 ? 1 : 15);
    if (id === 1) throw Error('lost response');
  } });
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('UPLOAD_NETWORK_UNAVAILABLE'));
  assert.deepEqual(f.state.uploads, [1, 2]);
  assert.deepEqual(f.state.deletes.map(i => i.publicId), ['heavyar/fixture/2']);
});

test('observer throws/rejections do not fail upload or corrupt progress', async () => {
  const f = fixture();
  const seen = [];
  const images = await f.uploadMultipleImages(uris, n => {
    seen.push(n);
    if (n % 2) throw Error('observer');
    return Promise.reject(Error('observer async'));
  });
  assert.equal(images.length, 4);
  assert.deepEqual(seen, [1, 2, 3, 4]);
  assert.equal(f.state.deletes.length, 0);
});

test('actual blob MIME/size validation retained and native resources released on failure', async () => {
  for (const [options, code] of [
    [{ mime: 'text/plain' }, 'INVALID_IMAGE'],
    [{ size: 0 }, 'INVALID_IMAGE_SIZE'],
    [{ size: 10 * 1024 * 1024 + 1 }, 'IMAGE_TOO_LARGE'],
  ]) {
    const f = fixture(options);
    await assert.rejects(f.uploadMultipleImages(uris), codeIs(code));
    assert.equal(f.state.reads.length, 2);
    assert.equal(f.state.closed, 2);
    assert.equal(f.state.uploads.length, 0);
  }
  const f = fixture({ mime: 'application/octet-stream', size: 10 * 1024 * 1024 });
  assert.equal((await f.uploadMultipleImages(uris.slice(0, 1))).length, 1);
});

test('unauthenticated/mismatched sessions do not read; empty batch does not schedule', async () => {
  const f = fixture();
  await assert.rejects(f.uploadMultipleImages(uris, undefined, 'other'), codeIs('AUTH_SESSION_CHANGED'));
  assert.deepEqual(await f.uploadMultipleImages([]), []);
  f.auth.currentUser = null;
  await assert.rejects(f.uploadMultipleImages(uris), codeIs('AUTH_REQUIRED'));
  assert.equal(f.state.reads.length, 0);
});

test('controlled timing: four mocked 100ms uploads sequential vs bounded actual service', async t => {
  const options = { upload: async () => { await delay(100); } };
  const sequential = fixture(options);
  let start = performance.now();
  for (const uri of uris) await sequential.uploadImageToCloudinary(uri, 'fixture');
  const beforeMs = performance.now() - start;
  const bounded = fixture(options);
  start = performance.now();
  await bounded.uploadMultipleImages(uris, undefined, 'fixture');
  const afterMs = performance.now() - start;
  assert.equal(sequential.state.peak, 1);
  assert.equal(bounded.state.peak, 2);
  assert.equal(bounded.state.reads.length, 4);
  assert.equal(bounded.state.uploads.length, 4);
  t.diagnostic(JSON.stringify({
    fixture: '4 images, mocked 100ms transport per upload; no native/device/network claims',
    beforeMs, afterMs, beforePeak: sequential.state.peak, afterPeak: bounded.state.peak,
  }));
});