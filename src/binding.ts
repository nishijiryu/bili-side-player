const KEY = "biliPlayerBoundTabId";

export async function getBoundTabId(): Promise<number | undefined> {
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return typeof value === "number" ? value : undefined;
}

export async function setBoundTabId(tabId?: number): Promise<void> {
  if (tabId === undefined) await chrome.storage.local.remove(KEY);
  else await chrome.storage.local.set({ [KEY]: tabId });
}

