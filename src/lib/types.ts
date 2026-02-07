export interface Server {
  name: string;
  token: string;
}

export interface Instance {
  id: string;
  name: string;
  connectionStatus: string;
  ownerJid: string;
  profilePicUrl?: string;
  profileName?: string;
  [key: string]: unknown;
}

export interface ServerSnapshot {
  serverName: string;
  instances: Instance[];
  totalInstances: number;
  connectedInstances: number;
  disconnectedInstances: number;
  timestamp: string;
}

export interface DashboardData {
  servers: ServerSnapshot[];
  totalInstances: number;
  totalConnected: number;
  totalDisconnected: number;
  lastPoll: string | null;
}

export interface WebhookAlert {
  server: string;
  disconnected_count: number;
  disconnected_instances: string[];
  timestamp: string;
  total_instances: number;
  connected_now: number;
}

export interface SearchResult {
  found: boolean;
  server?: string;
  instance?: Instance;
}
