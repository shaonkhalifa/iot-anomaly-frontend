import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PredictionResponse,
  CompareResponse,
  ModelInfo,
  HealthResponse,
  SensorReading,
} from '../models/sensor-data.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  // .NET backend — NOT directly the Flask API
  private baseUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  /** Health check */
  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`);
  }

  /** Available trained models */
  getModels(): Observable<{ models: ModelInfo[] }> {
    return this.http.get<{ models: ModelInfo[] }>(`${this.baseUrl}/models`);
  }

  /** Predict from JSON readings */
  predict(model: string, data: SensorReading[]): Observable<PredictionResponse> {
    return this.http.post<PredictionResponse>(`${this.baseUrl}/predict`, {
      model,
      data,
    });
  }

  /** Predict from CSV file upload */
  predictUpload(model: string, file: File): Observable<PredictionResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('model', model);
    return this.http.post<PredictionResponse>(
      `${this.baseUrl}/predict/upload`,
      form
    );
  }

  /** Compare all 3 models on same data */
  compare(data: SensorReading[]): Observable<CompareResponse> {
    return this.http.post<CompareResponse>(`${this.baseUrl}/predict/compare`, {
      data,
    });
  }

  /** Compare all 3 models on uploaded CSV/Excel file */
  compareUpload(file: File): Observable<CompareResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CompareResponse>(
      `${this.baseUrl}/predict/upload/compare`,
      form
    );
  }
}
