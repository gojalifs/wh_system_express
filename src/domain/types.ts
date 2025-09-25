export type Audience =
  | { mode: 'broadcast' }
  | { mode: 'users'; userIds: string[] };

export type ServerNotification = {
  type: 'notification';
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  ts: number;
};

export type MRInvalidate = {
  type: 'material_requests.list.invalidate';
  version: number;
  ts: number;
};

export type MRDelta = {
  type: 'material_requests.list.delta';
  version: number;
  changed: {
    added?: Array<Record<string, unknown>>;
    updated?: Array<Record<string, unknown>>;
    removed?: string[];
  };
  ts: number;
};

export type OutboundEvent = ServerNotification | MRInvalidate | MRDelta;

export type SubscribeMessage = { type: 'subscribe'; userId: string };
export type PingMessage = { type: 'ping' };
export type ClientMessage = SubscribeMessage | PingMessage;
