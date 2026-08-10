const deviceIdKey = "design-lab-device-id";

export function personalIdentityHeaders(): Record<string, string> {
  let id = window.localStorage.getItem(deviceIdKey);
  if (!id) {
    id = `device:${crypto.randomUUID()}`;
    window.localStorage.setItem(deviceIdKey, id);
  }
  return {
    "x-design-lab-device-id": id,
    "x-design-lab-device-name": "当前使用者",
  };
}
