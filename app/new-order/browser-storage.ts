const NEW_ORDER_STORAGE_TTL_MS = 72 * 60 * 60 * 1000;
const NEW_ORDER_SELECTED_PRODUCTS_STORAGE_PREFIX = "po-new-order-selected-products";
const PRODUCT_PICKER_SELECTION_STORAGE_PREFIX = "po-new-order-product-picker-selection";

type ExpiringStorageRecord = {
  value: string;
  expiresAt: number;
};

export function selectedProductsStorageKey(saleChannelId: string) {
  return `${NEW_ORDER_SELECTED_PRODUCTS_STORAGE_PREFIX}:${saleChannelId}`;
}

export function productPickerStorageKey(saleChannelId: string) {
  return `${PRODUCT_PICKER_SELECTION_STORAGE_PREFIX}:${saleChannelId}`;
}

function expiringRecord(value: string): ExpiringStorageRecord {
  return {
    value,
    expiresAt: Date.now() + NEW_ORDER_STORAGE_TTL_MS,
  };
}

function isExpiringStorageRecord(value: unknown): value is ExpiringStorageRecord {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Partial<ExpiringStorageRecord>).value === "string" &&
    typeof (value as Partial<ExpiringStorageRecord>).expiresAt === "number"
  );
}

function readStoredRecord(raw: string | null) {
  if (raw == null) return { value: null, expired: false, legacy: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isExpiringStorageRecord(parsed)) {
      return {
        value: parsed.expiresAt > Date.now() ? parsed.value : null,
        expired: parsed.expiresAt <= Date.now(),
        legacy: false,
      };
    }
  } catch {
    // Legacy values can be arbitrary strings.
  }

  return { value: raw, expired: false, legacy: true };
}

export function removeBrowserStorageItem(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function readBrowserStorageItem(storageKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const localValue = window.localStorage.getItem(storageKey);
    const localRecord = readStoredRecord(localValue);
    if (localRecord.expired) {
      removeBrowserStorageItem(storageKey);
      return null;
    }
    if (localRecord.value != null) {
      if (localRecord.legacy) {
        writeBrowserStorageItem(storageKey, localRecord.value);
      }
      return localRecord.value;
    }
  } catch {
    // Fall through to sessionStorage for browsers that block localStorage.
  }

  try {
    const sessionValue = window.sessionStorage.getItem(storageKey);
    const sessionRecord = readStoredRecord(sessionValue);
    if (sessionRecord.expired) {
      removeBrowserStorageItem(storageKey);
      return null;
    }
    if (sessionRecord.value != null) {
      writeBrowserStorageItem(storageKey, sessionRecord.value);
    }
    return sessionRecord.value;
  } catch {
    return null;
  }
}

export function readBrowserStorageEventItem(event: StorageEvent) {
  return readStoredRecord(event.newValue).value;
}

export function writeBrowserStorageItem(storageKey: string, value: string) {
  if (typeof window === "undefined") return;

  const storedValue = JSON.stringify(expiringRecord(value));

  try {
    window.localStorage.setItem(storageKey, storedValue);
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Nothing to clean up if sessionStorage is unavailable.
    }
    return;
  } catch {
    // Fall through to sessionStorage so draft state still works in this tab.
  }

  try {
    window.sessionStorage.setItem(storageKey, storedValue);
  } catch {
    // Ignore storage failures; the order flow should remain usable.
  }
}
