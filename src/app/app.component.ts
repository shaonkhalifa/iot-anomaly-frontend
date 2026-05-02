import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ApiService } from './services/api.service';
import { ModelInfo, PredictionResult, CompareResponse, PredictionSummary } from './models/sensor-data.model';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  healthStatus: 'ok' | 'degraded' | 'unknown' = 'unknown';

  uploadMode: 'file' | 'json' = 'file';
  selectedFile: File | null = null;
  selectedModel: string = 'isolation_forest';
  isDragOver = false;
  isLoading = false;
  isComparing = false;
  errorMsg: string | null = null;

  availableModels: ModelInfo[] = [
    { id: 'isolation_forest', name: 'Isolation Forest', ready: true },
    { id: 'one_class_svm', name: 'One-Class SVM', ready: true },
    { id: 'kmeans', name: 'K-Means', ready: true },
  ];

  predictions: PredictionResult[] = [];
  summary: PredictionSummary | null = null;
  compareData: CompareResponse | null = null;
  comparisonEntries: [string, any][] = [];

  activeTab: 'chart' | 'results' = 'chart';
  currentFilter: 'all' | 'normal' | 'anomaly' = 'all';

  get hasData(): boolean {
    return this.predictions.length > 0 || this.compareData !== null;
  }

  private timeChart: Chart | null = null;
  private compareChart: Chart | null = null;
  private pieChart: Chart | null = null;
  private barChart: Chart | null = null;

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.checkHealth();
  }

  checkHealth() {
    this.api.health().subscribe({
      next: (h) => {
        this.healthStatus = h.status === 'ok' ? 'ok' : 'degraded';
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
  onDragLeave() { this.isDragOver = false; }

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
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      this.errorMsg = 'Please upload a CSV or Excel file.';
      return;
    }
    this.selectedFile = file;
    this.errorMsg = null;
    this.clearResults();
  }

  clearFile() {
    this.selectedFile = null;
    this.errorMsg = null;
    this.clearResults();
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  clearResults() {
    this.predictions = [];
    this.summary = null;
    this.compareData = null;
    this.destroyCharts();
  }

  // ── Analyze ────────────────────────────────────────────────────────────
  analyze() {
    if (!this.selectedFile) { this.errorMsg = 'Please select a CSV file first.'; return; }
    this.isLoading = true;
    this.errorMsg = null;
    this.clearResults();

    this.api.predictUpload(this.selectedModel, this.selectedFile).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.predictions = res.predictions;
        this.summary = res.summary;
        this.activeTab = 'chart';
        setTimeout(() => {
          this.renderTimeChart();
          this.renderDashboardCharts();
        }, 100);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = err.error?.error ?? 'Prediction failed. Is the backend running?';
      },
    });
  }

  onModelChange() {
    if (this.predictions.length > 0 && !this.compareData && this.selectedFile) {
      this.analyze();
    }
  }

  // ── Compare all models ─────────────────────────────────────────────────
  compareAll() {
    if (!this.selectedFile) {
      this.errorMsg = 'Please select a CSV file first.';
      return;
    }
    this.isComparing = true;
    this.errorMsg = null;
    this.compareData = null;

    this.api.compareUpload(this.selectedFile).subscribe({
      next: (cmp) => {
        this.isComparing = false;
        this.compareData = cmp;
        this.comparisonEntries = Object.entries(cmp.comparison);
        setTimeout(() => this.renderCompareChart(), 100);
      },
      error: (err) => {
        this.isComparing = false;
        this.errorMsg = err.error?.error ?? 'Comparison failed.';
      },
    });
  }

  backToAnalysis() {
    this.compareData = null;
    this.activeTab = 'chart';
    setTimeout(() => {
      this.renderTimeChart();
      this.renderDashboardCharts();
    }, 50);
  }

  // ── Sensor Type Mapping ────────────────────────────────────────────────
  getSensorTypeName(logTypeId: number | undefined | null, logSubTypeId: number | undefined | null): string {
    if (logTypeId == null || logTypeId === 0) return 'General Sensor';
    if (logTypeId === 1) return 'External Alarm';
    if (logTypeId === 2) return 'DC Energy Reading';
    if (logTypeId === 3) return 'AC Energy Reading';
    if (logTypeId === 4) return 'Temperature Reading';
    if (logTypeId === 5) return 'Humidity Reading';
    if (logTypeId === 6) return 'Power Reading';
    return `Type ${logTypeId}`;
  }

  // ── Charts ─────────────────────────────────────────────────────────────
  switchToChart() {
    setTimeout(() => this.renderTimeChart(), 50);
  }

  renderDashboardCharts() {
    const pieCanvas = document.getElementById('pieChart') as HTMLCanvasElement;
    const barCanvas = document.getElementById('barChart') as HTMLCanvasElement;

    if (pieCanvas && this.summary) {
      this.pieChart = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Normal', 'Anomaly'],
          datasets: [{
            data: [this.summary.normal, this.summary.anomaly],
            backgroundColor: ['rgba(59,130,246,0.8)', 'rgba(239,68,68,0.8)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#CBD5E1' } } }
        }
      });
    }

    if (barCanvas && this.predictions.length > 0) {
      const anomalies = this.predictions.filter(p => p.label === -1);
      const typeCounts: { [key: string]: number } = {};
      anomalies.forEach(a => {
        const typeName = this.getSensorTypeName(a.LogType, a.LogSubType);
        typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
      });

      this.barChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(typeCounts).length ? Object.keys(typeCounts) : ['No Anomalies'],
          datasets: [{
            label: 'Anomaly Count',
            data: Object.keys(typeCounts).length ? Object.values(typeCounts) : [0],
            backgroundColor: 'rgba(245,158,11,0.8)',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
            y: { ticks: { color: '#94A3B8', stepSize: 1 }, grid: { color: 'rgba(51,65,85,0.5)' } }
          }
        }
      });
    }
  }

  renderTimeChart() {
    const canvas = document.getElementById('timeChart') as HTMLCanvasElement;
    if (!canvas || this.predictions.length === 0) return;
    if (this.timeChart) { this.timeChart.destroy(); }

    const labels = this.predictions.map((p: any) =>
      p.LogTime ? new Date(p.LogTime).toLocaleTimeString() : String(p.index)
    );

    this.timeChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Sensor Reading (Normal)',
            data: this.predictions.map((p: any) => (p.label === 1 ? p.LogFloatValue ?? null : null)),
            borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)',
            pointRadius: 2, pointHoverRadius: 5, tension: 0.3,
          },
          {
            label: 'Sensor Reading (Anomaly)',
            data: this.predictions.map((p: any) => (p.label === -1 ? p.LogFloatValue ?? null : null)),
            borderColor: 'transparent', backgroundColor: '#EF4444',
            pointBackgroundColor: '#EF4444', pointRadius: 7, pointHoverRadius: 9, showLine: false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { labels: { color: '#CBD5E1' } },
          tooltip: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, titleColor: '#F1F5F9', bodyColor: '#94A3B8' },
        },
        scales: {
          x: { ticks: { color: '#64748B', maxTicksLimit: 20 }, grid: { color: 'rgba(51,65,85,0.5)' } },
          y: { ticks: { color: '#64748B' }, grid: { color: 'rgba(51,65,85,0.5)' } },
        },
      },
    });
  }

  renderCompareChart() {
    const canvas = document.getElementById('compareChart') as HTMLCanvasElement;
    if (!canvas || !this.compareData) return;

    const entries = this.comparisonEntries;
    const labels = entries.map(([k]) => this.prettyModel(k));
    const anomaly = entries.map(([, v]) => v.anomalyCount);
    const normal = entries.map(([, v]) => v.normalCount);

    if (this.compareChart) { this.compareChart.destroy(); }

    this.compareChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Normal', data: normal, backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 6 },
          { label: 'Anomaly', data: anomaly, backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#CBD5E1' } },
          tooltip: { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1, titleColor: '#F1F5F9', bodyColor: '#94A3B8' },
        },
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(51,65,85,0.5)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(51,65,85,0.5)' } },
        },
      },
    });
  }

  destroyCharts() {
    if (this.timeChart) { this.timeChart.destroy(); this.timeChart = null; }
    if (this.compareChart) { this.compareChart.destroy(); this.compareChart = null; }
    if (this.pieChart) { this.pieChart.destroy(); this.pieChart = null; }
    if (this.barChart) { this.barChart.destroy(); this.barChart = null; }
  }

  // ── UI Helpers ─────────────────────────────────────────────────────────
  setFilter(filter: 'all' | 'normal' | 'anomaly') {
    this.currentFilter = filter;
    this.activeTab = 'results';
  }

  get filteredPredictions() {
    if (this.currentFilter === 'normal') return this.predictions.filter(p => p.label === 1);
    if (this.currentFilter === 'anomaly') return this.predictions.filter(p => p.label === -1);
    return this.predictions;
  }

  prettyModel(id: string): string {
    return { isolation_forest: 'Isolation Forest', one_class_svm: 'One-Class SVM', kmeans: 'K-Means' }[id] ?? id;
  }

  anomalyPct(v: { anomalyCount: number; normalCount: number }): string {
    const total = v.anomalyCount + v.normalCount;
    return total > 0 ? ((v.anomalyCount / total) * 100).toFixed(1) + '%' : '0%';
  }

  exportExcel(filter: 'all' | 'anomaly' | 'normal' = 'all') {
    let data: PredictionResult[];
    if (filter === 'anomaly') data = this.predictions.filter(p => p.label === -1);
    else if (filter === 'normal') data = this.predictions.filter(p => p.label === 1);
    else data = this.predictions;
    if (!data.length) return;

    const sheetName = filter === 'anomaly' ? 'Anomalies' : filter === 'normal' ? 'Normal Readings' : 'All Predictions';

    const rows = data.map((row: any) => ({
      '#': row.index + 1,
      'Device ID': row.RmsStationId ?? '',
      'Timestamp': row.LogTime ? new Date(row.LogTime).toLocaleString() : '',
      'Sensor Type': this.getSensorTypeName(row.LogTypeID, row.LogSubTypeID),
      'Float Value': row.LogFloatValue != null ? Number(row.LogFloatValue.toFixed(2)) : '',
      'Int Value': row.LogIntValue != null ? Number(row.LogIntValue.toFixed(2)) : '',
      'Net Delay (s)': row.time_delay_sec != null ? Number(row.time_delay_sec.toFixed(1)) : '',
      'Status': row.prediction,
      'Score': Number(row.score.toFixed(4)),
      'Warnings': row.warnings?.join('; ') ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const fileName = `anomaly_predictions_${filter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}
