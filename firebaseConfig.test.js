const fs = require('fs');

describe('firebase.json structure', () => {
  let config;

  beforeAll(() => {
    const raw = fs.readFileSync('./firebase.json', 'utf8');
    config = JSON.parse(raw);
  });

  test('should contain hosting and firestore keys', () => {
    expect(config).toHaveProperty('hosting');
    expect(config).toHaveProperty('firestore');
  });

  test('hosting should contain required fields', () => {
    const hosting = config.hosting;
    expect(hosting).toHaveProperty('public', 'public');
    expect(Array.isArray(hosting.ignore)).toBe(true);
    expect(Array.isArray(hosting.rewrites)).toBe(true);
  });

  test('rewrites should redirect all routes to index.html', () => {
    const rewrite = config.hosting.rewrites.find(r => r.source === '**');
    expect(rewrite.destination).toBe('/index.html');
  });
});