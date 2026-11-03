'use strict';
// Installation PWA : décision (invite native, guide iPhone/iPad, ou rien) sans navigateur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isIos, isStandalone, offer, createController } = require('../../src/pwa-install');

const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 };
const ipadSafari = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 };
const ipadNamed = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPad', maxTouchPoints: 5 };
const androidTablet = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 };
const desktop = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36', platform: 'Linux x86_64', maxTouchPoints: 0 };
const macTouchChrome = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 5 };

test('iPhone, iPad et iPadOS sont reconnus ; Android et ordinateur non', () => {
  assert.equal(isIos(iphone), true);
  assert.equal(isIos(ipadSafari), true);
  assert.equal(isIos(ipadNamed), true);
  assert.equal(isIos(androidTablet), false);
  assert.equal(isIos(desktop), false);
  assert.equal(isIos(macTouchChrome), false);
});

test('application déjà ouverte : pas d\'invite', () => {
  assert.equal(isStandalone({ navigator: { standalone: true }, matchMedia: () => ({ matches: false }) }), true);
  assert.equal(isStandalone({ navigator: {}, matchMedia: (q) => ({ matches: q.includes('standalone') }) }), true);
  assert.equal(isStandalone({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(offer({ installed: true, prompt: true, ios: true }), 'hidden');
  assert.equal(offer({ standalone: true, prompt: true, ios: true }), 'hidden');
});

test('invite native prioritaire, sinon guide iPhone/iPad, sinon rien', () => {
  assert.equal(offer({ prompt: true, ios: false }), 'prompt');
  assert.equal(offer({ prompt: true, ios: true, chromium: true }), 'prompt');
  assert.equal(offer({ ios: true }), 'ios');
  assert.equal(offer({ ios: true, chromium: true }), 'hidden');
  assert.equal(offer({}), 'hidden');
});

function fakeWindow(nav, standalone) {
  const listeners = {};
  return {
    navigator: nav,
    matchMedia: (q) => ({ matches: !!standalone && q.includes('standalone') }),
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type, ev) { listeners[type](ev); },
  };
}

test('beforeinstallprompt affiche le bouton, prompt() ouvre l\'invite une fois', async () => {
  const win = fakeWindow(androidTablet, false);
  const c = createController(win);
  const seen = [];
  c.onChange(() => seen.push(c.kind()));
  assert.equal(c.kind(), 'hidden');
  let prevented = false;
  let prompts = 0;
  win.fire('beforeinstallprompt', {
    preventDefault() { prevented = true; },
    prompt() { prompts += 1; return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(prevented, true);
  assert.equal(c.kind(), 'prompt');
  assert.deepEqual(seen, ['prompt']);
  assert.equal(await c.prompt(), 'accepted');
  assert.equal(prompts, 1);
  assert.equal(c.kind(), 'hidden');
  assert.equal(await c.prompt(), 'unavailable');
});

test('refus de l\'invite : le bouton disparaît, le guide iOS ne le remplace pas', async () => {
  const win = fakeWindow(iphone, false);
  const c = createController(win);
  assert.equal(c.kind(), 'ios');
  win.fire('beforeinstallprompt', {
    preventDefault() {},
    prompt() { return Promise.resolve(); },
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  assert.equal(c.kind(), 'prompt');
  assert.equal(await c.prompt(), 'dismissed');
  assert.equal(c.kind(), 'hidden');
});

test('iPhone et iPad sans invite native : guide ; déjà installée : rien', () => {
  assert.equal(createController(fakeWindow(iphone, false)).kind(), 'ios');
  assert.equal(createController(fakeWindow(ipadSafari, false)).kind(), 'ios');
  assert.equal(createController(fakeWindow(ipadNamed, true)).kind(), 'hidden');
  assert.equal(createController(fakeWindow(desktop, false)).kind(), 'hidden');
});

test('appinstalled retire l\'invite', () => {
  const win = fakeWindow(androidTablet, false);
  const c = createController(win);
  win.fire('beforeinstallprompt', { preventDefault() {}, prompt() { return Promise.resolve(); } });
  assert.equal(c.kind(), 'prompt');
  win.fire('appinstalled', {});
  assert.equal(c.kind(), 'hidden');
});
