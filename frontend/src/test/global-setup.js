/**
 * Global setup that runs before any tests
 * Initializes storage APIs needed by MSW
 */

// Setup localStorage before MSW loads
// Don't check if it exists - just create it
const LocalStorageMock = class {
  constructor() {
    this.store = new Map();
  }

  clear() {
    this.store.clear();
  }

  getItem(key) {
    return this.store.get(key) ?? null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
};

// Override storage APIs directly
Object.defineProperty(global, 'localStorage', {
  value: new LocalStorageMock(),
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'sessionStorage', {
  value: new LocalStorageMock(),
  writable: true,
  configurable: true
});

// Mock IndexedDB which MSW might also try to use
if (typeof global.indexedDB === 'undefined') {
  global.indexedDB = {
    open: () => ({
      onsuccess: null,
      onerror: null,
      result: {
        transaction: () => ({
          objectStore: () => ({
            get: () => ({ onsuccess: null, onerror: null }),
            put: () => ({ onsuccess: null, onerror: null }),
            delete: () => ({ onsuccess: null, onerror: null })
          })
        }),
        createObjectStore: () => {}
      }
    }),
    deleteDatabase: () => {}
  };
}

export default async function globalSetup() {
  // Any async setup can go here
  return () => {
    // Teardown function (optional)
  };
}
