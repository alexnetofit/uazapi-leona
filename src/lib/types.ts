export interface Server {
  name: string;
  token: string;
}

export interface Instance {
  id: string;
  name: string;
  status: string;
  owner: string;
  profilePicUrl?: string;
  profileName?: string;
  token?: string;
  paircode?: string;
  qrcode?: string;
  isBusiness?: boolean;
  plataform?: string;
  systemName?: string;
  current_presence?: string;
  lastDisconnect?: string;
  lastDisconnectReason?: string;
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

export interface PreviousCount {
  totalInstances: number;
  connectedInstances: number;
  disconnectedInstances: number;
  timestamp: string;
}

export interface ServerDashboard {
  serverName: string;
  totalInstances: number;
  connectedInstances: number;
  disconnectedInstances: number;
  timestamp: string;
  previous: PreviousCount | null;
  instances: Instance[];
  error?: boolean;
}

export interface DashboardData {
  servers: ServerDashboard[];
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
