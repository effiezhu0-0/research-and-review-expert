"use client";

export type StoredSolutionImage = { name: string; dataUrl: string };
const databaseName = "design-lab-assets";
const storeName = "solution-images";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSolutionImages(images: StoredSolutionImage[]) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => { const transaction = database.transaction(storeName, "readwrite"); transaction.objectStore(storeName).put(images, "current"); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

export async function readSolutionImages(): Promise<StoredSolutionImage[]> {
  const database = await openDatabase();
  const images = await new Promise<StoredSolutionImage[]>((resolve, reject) => { const request = database.transaction(storeName, "readonly").objectStore(storeName).get("current"); request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []); request.onerror = () => reject(request.error); });
  database.close(); return images;
}
