export type SyncOrAsync = void | Promise<void>;

export type OpenDeleteReasonModal = (
  targetLabel: string,
  callback: (reason: string) => SyncOrAsync
) => void;
