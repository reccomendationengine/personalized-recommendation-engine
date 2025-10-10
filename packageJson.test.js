const fs = require('fs');

describe('package.json', () => {
  let pkg;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  });

  test('should have a valid name and version', () => {
    expect(pkg).toHaveProperty('name');
    expect(pkg).toHaveProperty('version');
  });

  test('should contain start and test scripts', () => {
    expect(pkg.scripts).toHaveProperty('start');
    expect(pkg.scripts).toHaveProperty('test');
  });

  test('should include firebase dependencies', () => {
    expect(pkg.dependencies).toHaveProperty('firebase');
    expect(pkg.dependencies).toHaveProperty('firebase-admin');
  });
});