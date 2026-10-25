const emailLocal = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/;
const emailLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

export function isEmail(value: string): boolean {
  if (value.length > 254 || /\P{ASCII}/u.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1) return false;
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
  if (!authority || authority.includes("@") || authority.endsWith(":")) return false;
  const parsed = URL.parse(value);
  if (!parsed) return false;
  return (
    !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || authority.split(":")[0] === parsed.hostname
  );
}
