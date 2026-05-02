import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PredictionResult, PredictionSummary, CompareResponse } from '../models/sensor-data.model';

@Injectable({
  providedIn: 'root'
})
export class DataStateService {
  private predictionsSub = new BehaviorSubject<PredictionResult[]>([]);
  private summarySub = new BehaviorSubject<PredictionSummary | null>(null);
  private compareDataSub = new BehaviorSubject<CompareResponse | null>(null);
  private selectedModelSub = new BehaviorSubject<string>('isolation_forest');
  private activeTabSub = new BehaviorSubject<'chart' | 'results' | 'compare'>('chart');

  predictions$ = this.predictionsSub.asObservable();
  summary$ = this.summarySub.asObservable();
  compareData$ = this.compareDataSub.asObservable();
  selectedModel$ = this.selectedModelSub.asObservable();
  activeTab$ = this.activeTabSub.asObservable();

  setAnalyzeData(predictions: PredictionResult[], summary: PredictionSummary, model: string) {
    this.predictionsSub.next(predictions);
    this.summarySub.next(summary);
    this.selectedModelSub.next(model);
    this.compareDataSub.next(null);
    this.activeTabSub.next('chart');
  }

  setCompareData(compareData: CompareResponse) {
    this.compareDataSub.next(compareData);
    this.predictionsSub.next([]);
    this.summarySub.next(null);
    this.activeTabSub.next('compare');
  }

  clearData() {
    this.predictionsSub.next([]);
    this.summarySub.next(null);
    this.compareDataSub.next(null);
  }

  get currentPredictions() { return this.predictionsSub.value; }
  get currentSummary() { return this.summarySub.value; }
  get currentSelectedModel() { return this.selectedModelSub.value; }
}
