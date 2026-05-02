import { Routes } from '@angular/router';
import { AnalyzeComponent } from './components/analyze/analyze.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: '/analyze', pathMatch: 'full' },
  { path: 'analyze', component: AnalyzeComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: '**', redirectTo: '/analyze' }
];
