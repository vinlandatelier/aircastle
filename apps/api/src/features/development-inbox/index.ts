export interface EmailMessage {
  readonly messageId: string;
  readonly date: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html?: string;
  readonly text: string;
}

export interface DevelopmentInboxEntry {
  readonly mail: EmailMessage;
  readonly read: boolean;
}

export interface DevelopmentInboxPublication {
  /** Publishes once, synchronously without throwing after durable link commit; repeated calls are harmless. */
  commit: () => void;
  /** Cancels unpublished preparation; repeated calls and cancellation after publication are harmless. */
  abort: () => void;
}

export interface DevelopmentInbox {
  /** Reserves publication before durable link replacement without exposing the message. */
  prepare: (message: EmailMessage) => Promise<DevelopmentInboxPublication>;
  list: () => readonly DevelopmentInboxEntry[];
  open: (messageId: string) => DevelopmentInboxEntry | undefined;
}

export function createDevelopmentInbox(): DevelopmentInbox {
  const entries: { mail: EmailMessage; read: boolean }[] = [];
  return {
    prepare: async (message) => {
      const mail = structuredClone(message);
      let state: "pending" | "published" | "aborted" = "pending";
      return {
        commit() {
          if (state !== "pending") return;
          state = "published";
          entries.unshift({ mail, read: false });
          entries.sort((left, right) => Date.parse(right.mail.date) - Date.parse(left.mail.date));
          if (entries.length > 100) entries.length = 100;
        },
        abort() {
          if (state === "pending") state = "aborted";
        },
      };
    },
    list: () => structuredClone(entries),
    open: (messageId) => {
      const entry = entries.find((item) => item.mail.messageId === messageId);
      if (!entry) return undefined;
      entry.read = true;
      return structuredClone(entry);
    },
  };
}
