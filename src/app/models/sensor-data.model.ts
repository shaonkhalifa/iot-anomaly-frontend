export interface SensorReading {
  LogFloatValue?: number;
  LogIntValue?: number;
  LogTime?: string;
  ServerTime?: string;
  LogTypeID?: number;
  LogSubTypeID?: number;
  NodeId?: string;
}

export interface PredictionResult {
  index: number;
  prediction: 'Normal' | 'Anomaly';
  label: 1 | -1;
  score: number;
  timestamp?: string;
  temperature?: number;
  humidity?: number;
  sensorId?: string;
  LogTime?: string;
  ServerTime?: string;
  LogFloatValue?: number;
  LogIntValue?: number;
  LogTypeID?: number;
  LogSubTypeID?: number;
  NodeId?: string;
}

export interface PredictionSummary {
  total: number;
  normal: number;
  anomaly: number;
  anomalyPct: number;
}

export interface PredictionResponse {
  model: string;
  filename?: string;
  predictions: PredictionResult[];
  summary: PredictionSummary;
}

export interface CompareModelResult {
  anomalyCount: number;
  normalCount: number;
  anomalyPct: number;
  scoreMean: number;
  predictions: PredictionResult[];
}

export interface CompareResponse {
  totalRecords: number;
  comparison: Record<string, CompareModelResult>;
}

export interface ModelInfo {
  id: string;
  name: string;
  ready: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  modelsReady: Record<string, boolean>;
  backendVersion?: string;
}
