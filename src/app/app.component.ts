import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import {
  PredictionResult,
  PredictionSummary,
  CompareResponse,
  ModelInfo,
} from './models/sensor-data.model';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HttpClientModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  // ── State ──────────────────────────────────────────────────────────────
  selectedFile: File | null = null;
  selectedModel: string = 'isolation_forest';
  isDragOver = false;
  isLoading = false;
  isComparing = false;
  errorMsg: string | null = null;
  healthStatus: 'ok' | 'degraded' | 'unknown' = 'unknown';

  predictions: PredictionResult[] = [];
  summary: PredictionSummary | null = null;
  compareData: CompareResponse | null = null;
  availableModels: ModelInfo[] = [
    { id: 'isolation_forest', name: 'Isolation Forest', ready: true },
    { id: 'one_class_svm',    name: 'One-Class SVM',   ready: true },
    { id: 'kmeans',           name: 'K-Means',          ready: true },
  ];

  activeTab: 'results' | 'chart' | 'compare' = 'chart';
  private timeChart: Chart | null = null;
  private compareChart: Chart | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.checkHealth();
  }

  // ── Health ─────────────────────────────────────────────────────────────
  checkHealth() {
    this.api.health().subscribe({
      next: (h) => {
        this.healthStatus = h.status === 'ok' ? 'ok' : 'degraded';
        // Update model readiness
        if (h.modelsReady) {
          this.availableModels = this.availableModels.map((m) => ({
            ...m,
            ready: h.modelsReady[m.id] ?? false,
          }));
        }
      },
      error: () => {
        this.healthStatus = 'degraded';
      },
    });
  }

  // ── File Handling ──────────────────────────────────────────────────────
  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragOver = true; }
  onDragLeave()            { this.isDragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) this.setFile(file);
  }

  onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) this.setFile(input.files[0]);
  }

  setFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      this.errorMsg = 'Please upload a CSV file.';
      return;
    }
    this.selectedFile = file;
    this.errorMsg = null;
    this.predictions = [];
    this.summary = null;
    this.compareData = null;
    this.destroyCharts();
  }

  clearFile() {
    this.selectedFile = null;
    this.predictions = [];
    this.summary = null;
    this.compareData = null;
    this.errorMsg = null;
    this.destroyCharts();
  }

  // ── Analyze ────────────────────────────────────────────────────────────
  analyze() {
    if (!this.selectedFile) { this.errorMsg = 'Please select a CSV file first.'; return; }
    this.isLoading = true;
    this.errorMsg = null;
    this.predictions = [];
    this.summary = null;
    this.destroyCharts();

    this.api.predictUpload(this.selectedModel, this.selectedFile).subscribe({
      next: (res) => {
        this.predictions = res.predictions;
        this.summary = res.summary;
        this.isLoading = false;
        this.activeTab = 'chart';
        setTimeout(() => this.renderTimeChart(), 50);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err.error?.error ?? 'Prediction failed. Is the backend running?';
      },
    });
  }

  // ── Compare all models ─────────────────────────────────────────────────
  compareAll() {
    if (!this.selectedFile) { this.errorMsg = 'Please select a CSV file first.'; return; }
    this.isComparing = true;
    this.errorMsg = null;

    // Build minimal sensor data from file by first analysing with IF then comparing
    this.api.predictUpload('isolation_forest', this.selectedFile).subscribe({
      next: (res) => {
        const data = res.predictions.map((p) => ({
          temperature: p.temperature ?? 0,
          humidity: p.humidity ?? 0,
          timestamp: p.timestamp,
          sensorId: p.sensorId,
        }));

        this.api.compare(data).subscribe({
          next: (cmp) => {
            this.compareData = cmp;
            this.isComparing = false;
            this.activeTab = 'compare';
            setTimeout(() => this.renderCompareChart(), 50);
          },
          error: (e) => {
            this.isComparing = false;
            this.errorMsg = e.error?.error ?? 'Comparison failed.';
          },
        });
      },
      error: (err) => {
        this.isComparing = false;
        this.errorMsg = err.error?.error ?? 'Initial prediction for comparison failed.';
      },
    });
  }

  // ── Charts ─────────────────────────────────────────────────────────────
  renderTimeChart() {
    const canvas = document.getElementById('timeChart') as HTMLCanvasElement;
    if (!canvas || this.predictions.length === 0) return;
    this.destroyCharts();

    const normal  = this.predictions.filter((p) => p.label === 1);
    const anomaly = this.predictions.filter((p) => p.label === -1);

    const labels = this.predictions.map((p) =>
      p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : String(p.index)
    );

    this.timeChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Temperature (Normal)',
            data: this.predictions.map((p) => (p.label === 1  ? p.temperature ?? null : null)),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.3,
          },
          {
            label: 'Temperature (Anomaly)',
            data: this.predictions.map((p) => (p.label === -1 ? p.temperature ?? null : null)),
            borderColor: 'transparent',
            backgroundColor: '#EF4444',
            pointBackgroundColor: '#EF4444',
            pointRadius: 7,
            pointHoverRadius: 9,
            showLine: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { labels: { color: '#CBD5E1' } },
          tooltip: {
            backgroundColor: '#1E293B',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#F1F5F9',
            bodyColor: '#94A3B8',
          },
        },
        scales: {
          x: {
            ticks: { color: '#64748B', maxTicksLimit: 20 },
            grid:  { color: 'rgba(51,65,85,0.5)' },
          },
          y: {
            ticks: { color: '#64748B' },
            grid:  { color: 'rgba(51,65,85,0.5)' },
          },
        },
      },
    });
  }

  renderCompareChart() {
    const canvas = document.getElementById('compareChart') as HTMLCanvasElement;
    if (!canvas || !this.compareData) return;

    const entries = Object.entries(this.compareData.comparison);
    const labels  = entries.map(([k]) => this.prettyModel(k));
    const anomaly = entries.map(([, v]) => v.anomalyCount);
    const normal  = entries.map(([, v]) => v.normalCount);

    if (this.compareChart) { this.compareChart.destroy(); this.compareChart = null; }

    this.compareChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Normal',  data: normal,  backgroundColor: 'rgba(59,130,246,0.75)',  borderRadius: 6 },
          { label: 'Anomaly', data: anomaly, backgroundColor: 'rgba(239,68,68,0.75)',   borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { labels: { color: '#CBD5E1' } },
          tooltip: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1,
                     titleColor: '#F1F5F9', bodyColor: '#94A3B8' },
        },
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(51,65,85,0.5)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(51,65,85,0.5)' } },
        },
      },
    });
  }

  destroyCharts() {
    if (this.timeChart)    { this.timeChart.destroy();    this.timeChart    = null; }
    if (this.compareChart) { this.compareChart.destroy(); this.compareChart = null; }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  prettyModel(id: string): string {
    return { isolation_forest: 'Isolation Forest', one_class_svm: 'One-Class SVM', kmeans: 'K-Means' }[id] ?? id;
  }

  anomalyPct(v: { anomalyCount: number; normalCount: number }): string {
    const total = v.anomalyCount + v.normalCount;
    return total > 0 ? ((v.anomalyCount / total) * 100).toFixed(1) + '%' : '0%';
  }

  compareEntries(): [string, any][] {
    return this.compareData ? Object.entries(this.compareData.comparison) : [];
  }
}
