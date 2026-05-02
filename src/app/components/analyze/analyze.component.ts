import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { DataStateService } from '../../services/data-state.service';
import { ModelInfo, PredictionResult, CompareResponse, PredictionSummary } from '../../models/sensor-data.model';
import { Chart, registerables } from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(...registerables);

@Component({
  selector: 'app-analyze',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analyze.component.html',
  styleUrls: ['./analyze.component.css']
})
export class AnalyzeComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  uploadMode: 'file' | 'json' = 'file';
  jsonInputText: string = '';
  selectedFile: File | null = null;
  selectedModel: string = 'isolation_forest';
  isDragOver = false;
  isLoading = false;
  isComparing = false;
  errorMsg: string | null = null;

  availableModels: ModelInfo[] = [
    { id: 'isolation_forest', name: 'Isolation Forest', ready: true },
    { id: 'one_class_svm',    name: 'One-Class SVM',   ready: true },
    { id: 'kmeans',           name: 'K-Means',          ready: true },
  ];

  predictions: PredictionResult[] = [];
  summary: PredictionSummary | null = null;
  compareData: CompareResponse | null = null;
  comparisonEntries: [string, any][] = [];

  activeTab: 'results' | 'chart' | 'compare' = 'chart';
  currentFilter: 'all' | 'normal' | 'anomaly' = 'all';

  private timeChart: Chart | null = null;
  private compareChart: Chart | null = null;

  constructor(private api: ApiService, private dataState: DataStateService) {}

  ngOnInit() {
    this.api.health().subscribe({
      next: (h) => {
        if (h.modelsReady) {
          this.availableModels = this.availableModels.map((m) => ({
            ...m,
            ready: h.modelsReady[m.id] ?? false,
          }));
        }
      }
    });

    // Restore state if coming back from Dashboard
    this.dataState.predictions$.subscribe(p => {
      this.predictions = p;
      if (p.length > 0 && !this.compareData) {
        setTimeout(() => this.renderTimeChart(), 50);
      }
    });
    this.dataState.summary$.subscribe(s => this.summary = s);
    this.dataState.compareData$.subscribe(c => {
      this.compareData = c;
      if (c) {
        this.comparisonEntries = Object.entries(c.comparison);
        setTimeout(() => this.renderCompareChart(), 50);
      }
    });
    this.dataState.activeTab$.subscribe(t => this.activeTab = t);
    this.dataState.selectedModel$.subscribe(m => this.selectedModel = m);
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
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      this.errorMsg = 'Please upload a CSV or Excel file.';
      return;
    }
    this.selectedFile = file;
    this.errorMsg = null;
    this.dataState.clearData();
    this.destroyCharts();
  }

  clearFile() {
    this.selectedFile = null;
    this.errorMsg = null;
    this.dataState.clearData();
    this.destroyCharts();
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = ''; // FIX: Allow same file re-upload
    }
  }

  // ── Analyze ────────────────────────────────────────────────────────────
  analyze() {
    if (!this.selectedFile) { this.errorMsg = 'Please select a CSV file first.'; return; }
    this.isLoading = true;
    this.errorMsg = null;
    this.dataState.clearData();
    this.destroyCharts();

    this.api.predictUpload(this.selectedModel, this.selectedFile).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.dataState.setAnalyzeData(res.predictions, res.summary, this.selectedModel);
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
    this.isComparing = true;
    this.errorMsg = null;
    this.dataState.clearData();
    this.destroyCharts();

    if (this.uploadMode === 'file') {
      if (!this.selectedFile) {
        this.errorMsg = 'Please select a CSV file first.';
        this.isComparing = false;
        return;
      }
      this.api.compareUpload(this.selectedFile).subscribe({
        next: (cmp) => {
          this.isComparing = false;
          this.dataState.setCompareData(cmp);
        },
        error: (err) => {
          this.isComparing = false;
          this.errorMsg = err.error?.error ?? 'Comparison failed.';
        },
      });
    }
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
            data: this.predictions.map((p: any) => (p.label === 1  ? p.LogFloatValue ?? null : null)),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.3,
          },
          {
            label: 'Sensor Reading (Anomaly)',
            data: this.predictions.map((p: any) => (p.label === -1 ? p.LogFloatValue ?? null : null)),
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
    const labels  = entries.map(([k]) => this.prettyModel(k));
    const anomaly = entries.map(([, v]) => v.anomalyCount);
    const normal  = entries.map(([, v]) => v.normalCount);

    if (this.compareChart) { this.compareChart.destroy(); }

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
    if (this.timeChart)    { this.timeChart.destroy();    this.timeChart    = null; }
    if (this.compareChart) { this.compareChart.destroy(); this.compareChart = null; }
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
      'Sensor Type': this.getSensorTypeName(row.LogType, row.LogSubType),
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
    const fileName = `anomaly_predictions_${filter}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}
