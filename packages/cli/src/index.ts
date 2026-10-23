export interface PushOptions {
  cwd?: string;
  apiKey?: string;
  reconcile?: boolean;
  interactive?: boolean;
  confirm?: (diff: string) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  output?: (message: string) => void;
}
export async function push(_options: PushOptions = {}): Promise<number> {
  return 1;
}
