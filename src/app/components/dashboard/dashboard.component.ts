import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataStateService } from '../../services/data-state.service';
import { PredictionResult, PredictionSummary } from '../../models/sensor-data.model';
import { Chart, registerables } from 'chart.js';
import { RouterModule } from '@angular/router';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  predictions: PredictionResult[] = [];
  summary: PredictionSummary | null = null;
  selectedModel: string = '';

  private pieChart: Chart | null = null;
  private barChart: Chart | null = null;

  constructor(private dataState: DataStateService) {}

  ngOnInit() {
    this.dataState.predictions$.subscribe(p => {
      this.predictions = p;
      if (this.predictions.length > 0) {
        setTimeout(() => this.renderCharts(), 50);
      } else {
        this.destroyCharts();
      }
    });
    this.dataState.summary$.subscribe(s => this.summary = s);
    this.dataState.selectedModel$.subscribe(m => this.selectedModel = m);
  }

  ngOnDestroy() {
    this.destroyCharts();
  }

  prettyModel(id: string): string {
    return { isolation_forest: 'Isolation Forest', one_class_svm: 'One-Class SVM', kmeans: 'K-Means' }[id] ?? id;
  }

  renderCharts() {
    this.destroyCharts();
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
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#CBD5E1' } }
          }
        }
      });
    }

    if (barCanvas && this.predictions.length > 0) {
      // Aggregate anomalies by Sensor Type
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
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
            y: { ticks: { color: '#94A3B8', stepSize: 1 }, grid: { color: 'rgba(51,65,85,0.5)' } }
          }
        }
      });
    }
  }

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

  destroyCharts() {
    if (this.pieChart) { this.pieChart.destroy(); this.pieChart = null; }
    if (this.barChart) { this.barChart.destroy(); this.barChart = null; }
  }
}
