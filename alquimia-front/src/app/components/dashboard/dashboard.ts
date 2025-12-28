import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VentaService } from '../../services/venta.service';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.html'
})
export class DashboardComponent implements OnInit {
  private ventaService = inject(VentaService);
  private cd = inject(ChangeDetectorRef);
  
  metricas: any = null;
  loading = true;
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];

  ngOnInit() {
    this.cargarMetricas();
  }

  cambiarFecha() {
    this.cargarMetricas();
  }

  cargarMetricas() {
    this.ventaService.getMetricasDia(this.fechaSeleccionada).subscribe({
      next: (data) => {
        this.metricas = data;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando métricas:', err); // <--- Muestra el error en consola
        this.loading = false; // <--- ¡IMPORTANTE! Apagamos el spinner
        this.cd.detectChanges();
        // Opcional: mostrar una notificación
        // this.notif.show('Error al cargar datos del día', 'error');
      }
    });
  }
}