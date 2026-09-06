/**
 * Model Service
 * Client for interacting with ML model prediction endpoints
 */

import axios, { AxiosInstance } from 'axios';

interface PredictionRecord {
  risk_score: number;
  transaction_count: number;
  amount: number;
  age_days?: number;
  [key: string]: any;
}

interface PredictionResponse {
  model_id: number;
  prediction: number;
  confidence: number;
  timestamp: string;
  metadata?: any;
  error?: string;
}

interface ModelStatus {
  [key: string]: {
    loaded: boolean;
    metadata?: any;
    error?: string;
  };
}

// Resolve the base URL for the model service.
//
// The generated API client (custom-fetch.ts) uses VITE_API_BASE_URL as a plain
// origin (e.g. https://cashnet-node.onrender.com) and its generated paths
// already include /api (e.g. /api/cases).
//
// This service calls paths like /models/predict/182, so it needs a base that
// ends in /api. We derive that by taking the origin from VITE_API_BASE_URL and
// appending /api, or fall back to /api for same-origin local dev.
function resolveBaseURL(): string {
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as any).env?.VITE_API_BASE_URL) ||
    process.env.REACT_APP_API_URL;

  if (env && env.length > 0) {
    // Strip any trailing /api suffix so we never double it, then append /api
    const base = env.replace(/\/$/, '').replace(/\/api$/, '');
    return `${base}/api`;
  }
  return '/api';
}

class ModelService {
  private apiClient: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string = resolveBaseURL()) {
    this.baseURL = baseURL;
    this.apiClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }

  /**
   * Get status of all models
   */
  async getModelStatus(): Promise<ModelStatus> {
    try {
      const response = await this.apiClient.get<{ models: ModelStatus }>('/models/status');
      return response.data.models;
    } catch (error) {
      console.error('Error fetching model status:', error);
      throw error;
    }
  }

  /**
   * Predict using Model 182 (Crypto/VASP/Cross-Border)
   */
  async predictModel182(record: PredictionRecord): Promise<PredictionResponse> {
    return this.predict(182, record);
  }

  /**
   * Predict using Model 183 (AML Detection)
   */
  async predictModel183(record: PredictionRecord): Promise<PredictionResponse> {
    return this.predict(183, record);
  }

  /**
   * Predict using Model 184 (Complaint Typology)
   */
  async predictModel184(record: PredictionRecord): Promise<PredictionResponse> {
    return this.predict(184, record);
  }

  /**
   * Generic predict method
   */
  private async predict(
    modelId: number,
    record: PredictionRecord
  ): Promise<PredictionResponse> {
    try {
      const response = await this.apiClient.post<PredictionResponse>(
        `/models/predict/${modelId}`,
        { record }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error predicting with model ${modelId}:`, error);
      return {
        model_id: modelId,
        prediction: -1,
        confidence: 0,
        timestamp: new Date().toISOString(),
        error: error.message || 'Prediction failed',
      };
    }
  }

  /**
   * Batch predictions for multiple records across multiple models
   */
  async batchPredict(
    records: PredictionRecord[],
    modelIds: number[] = [182, 183, 184]
  ): Promise<{
    timestamp: string;
    total_records: number;
    models_processed: number;
    results: Array<{
      model_id: number;
      count: number;
      predictions: PredictionResponse[];
    }>;
  }> {
    try {
      const response = await this.apiClient.post(
        '/models/batch-predict',
        {
          records,
          modelIds,
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error in batch prediction:', error);
      throw error;
    }
  }

  /**
   * Reload all models
   */
  async reloadModels(): Promise<any> {
    try {
      const response = await this.apiClient.post('/models/reload');
      return response.data;
    } catch (error) {
      console.error('Error reloading models:', error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get('/models/info');
      return response.data;
    } catch (error) {
      console.error('Error fetching model info:', error);
      throw error;
    }
  }

  /**
   * Check health of model service
   */
  async checkHealth(): Promise<any> {
    try {
      const response = await this.apiClient.get('/models/health');
      return response.data;
    } catch (error) {
      console.error('Error checking model service health:', error);
      throw error;
    }
  }

  /**
   * Predict risk score for a wallet/case
   */
  async predictWalletRisk(walletData: {
    address: string;
    transactionCount: number;
    totalVolume: number;
    ageInDays: number;
    reputation?: number;
  }): Promise<PredictionResponse> {
    const record: PredictionRecord = {
      risk_score: walletData.reputation || 0.5,
      transaction_count: walletData.transactionCount,
      amount: walletData.totalVolume,
      age_days: walletData.ageInDays,
    };

    // Use Model 182 for crypto risk prediction
    return this.predictModel182(record);
  }

  /**
   * Predict AML risk
   */
  async predictAMLRisk(transactionData: {
    amount: number;
    frequency: number;
    patterns: number;
    anomalies: number;
  }): Promise<PredictionResponse> {
    const record: PredictionRecord = {
      risk_score: (transactionData.anomalies / 10) * 0.3 + (transactionData.patterns / 10) * 0.2,
      transaction_count: transactionData.frequency,
      amount: transactionData.amount,
      age_days: 30,
    };

    // Use Model 183 for AML risk
    return this.predictModel183(record);
  }

  /**
   * Predict complaint typology
   */
  async predictComplaintTypology(complaintData: {
    text: string;
    category?: string;
  }): Promise<PredictionResponse> {
    const record: PredictionRecord = {
      risk_score: 0.5,
      transaction_count: 0,
      amount: 0,
      age_days: 1,
      text: complaintData.text,
      category: complaintData.category,
    };

    // Use Model 184 for typology
    return this.predictModel184(record);
  }

  /**
   * Update API base URL (for dynamic configuration)
   */
  setBaseURL(url: string): void {
    this.baseURL = url;
    this.apiClient = axios.create({
      baseURL: url,
      timeout: 30000,
    });
  }

  /**
   * Set authorization token
   */
  setAuthToken(token: string): void {
    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}

// Export singleton instance
export const modelService = new ModelService();
export default ModelService;
