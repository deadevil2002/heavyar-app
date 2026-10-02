import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = 'heavyar-app';
const webAppId = '1:894313164992:web:ec7ecdea9fa4630d96fd25';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = resolve(repositoryRoot, 'artifacts', 'heavyar-admin');
const firebaseCommand = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const packageManagerCli = process.env.npm_execpath;

function fail(message) {
  throw new Error(`[Admin production build] ${message}`);
}

function readFirebaseSdkConfig() {
  const result = spawnSync(
    firebaseCommand,
    ['apps:sdkconfig', 'web', webAppId, '--project', projectId, '--json'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail('Firebase CLI could not read the Heavyar Web app configuration. Authenticate and retry.');
  }

  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    fail('Firebase CLI returned an unreadable Web app configuration.');
  }

  const config = response?.result?.sdkConfig ?? response?.result;
  if (!config || typeof config !== 'object') {
    fail('Firebase CLI did not return an SDK configuration.');
  }
  if (config.projectId !== projectId) {
    fail(`Refusing Firebase project "${String(config.projectId)}".`);
  }

  return config;
}

function buildEnvironment(config) {
  const fields = {
    VITE_FIREBASE_API_KEY: config.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
    VITE_FIREBASE_PROJECT_ID: config.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: config.messagingSenderId,
    VITE_FIREBASE_APP_ID: config.appId,
  };

  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.length === 0) {
      fail(`Firebase SDK configuration is missing ${name}.`);
    }
  }

  return fields;
}

function buildAdmin(environment) {
  if (!packageManagerCli) {
    fail('Run this command through pnpm.');
  }

  const result = spawnSync(
    process.execPath,
    [packageManagerCli, '--dir', 'artifacts/heavyar-admin', 'run', 'build'],
    {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function verifyBuild(environment) {
  const publicRoot = resolve(adminRoot, 'dist', 'public');
  const index = readFileSync(resolve(publicRoot, 'index.html'), 'utf8');
  const scriptPaths = readdirSync(resolve(publicRoot, 'assets'))
    .filter((name) => /^index-.*\.js$/.test(name));

  if (scriptPaths.length !== 1) {
    fail(`Expected one production JavaScript entry; found ${scriptPaths.length}.`);
  }
  if (!index.includes(`/assets/${scriptPaths[0]}`)) {
    fail('Production index.html does not reference the generated JavaScript entry.');
  }

  const script = readFileSync(resolve(publicRoot, 'assets', scriptPaths[0]), 'utf8');
  for (const [name, value] of Object.entries(environment)) {
    if (!script.includes(value)) {
      fail(`Generated JavaScript does not contain ${name}.`);
    }
  }

  console.log(`Verified Heavyar Admin production build: ${scriptPaths[0]}`);
}

const config = readFirebaseSdkConfig();
const environment = buildEnvironment(config);
buildAdmin(environment);
verifyBuild(environment);
