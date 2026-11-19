import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Baixaria', loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio) },
  { path: 'notas', title: 'Notas no braço', loadComponent: () => import('./pages/notas/notas').then((m) => m.Notas) },
  {
    path: 'intervalos',
    title: 'Intervalos',
    loadComponent: () => import('./pages/intervalos/intervalos').then((m) => m.Intervalos),
  },
  {
    path: 'microfone',
    title: 'Tocar no baixo',
    loadComponent: () => import('./pages/microfone/microfone').then((m) => m.Microfone),
  },
  { path: 'mapa', title: 'Mapa do braço', loadComponent: () => import('./pages/mapa/mapa').then((m) => m.Mapa) },
  {
    path: 'estatisticas',
    title: 'Estatísticas',
    loadComponent: () => import('./pages/estatisticas/estatisticas').then((m) => m.Estatisticas),
  },
  { path: '**', redirectTo: '' },
];
