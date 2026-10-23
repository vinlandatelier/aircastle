const emailLocal = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/;
const emailLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

export function isEmail(value: string): boolean {
  if (value.length > 254 || /[^\x00-\x7f]/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split(".");
  return (
    local.length <= 64 &&
    emailLocal.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && emailLabel.test(label)) &&
    !/^\d+$/.test(labels.at(-1)!)
  );
}

export function isUrl(value: string): boolean {
  if (/[\s\p{White_Space}\\]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return false;
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || authority.includes("@")) return false;
  let host = authority;
  let port: string | undefined;
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    if (close < 0) return false;
    host = authority.slice(0, close + 1);
    const rest = authority.slice(close + 1);
    if (rest && !rest.startsWith(":")) return false;
    if (rest) port = rest.slice(1);
  } else {
    const colon = authority.lastIndexOf(":");
    if (colon >= 0) {
      host = authority.slice(0, colon);
      port = authority.slice(colon + 1);
    }
  }
  if (port !== undefined && (!/^\d+$/.test(port) || Number(port) > 65535)) return false;
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || (parsed.protocol !== "http:" && parsed.protocol !== "https:"))
      return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) && host !== parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}
