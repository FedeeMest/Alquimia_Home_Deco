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
  loading = true;       // Carga inicial o cambio de fecha (Pantalla completa)
  loadingTabla = false; // Solo cambio de página (Transparencia en tabla)
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];

  // Variables de Paginación
  paginaActual = 1;
  limit = 5; // Muestra 5 ventas por página en el dashboard
  totalPaginas = 1;

  ngOnInit() {
    this.cargarMetricas(true);
  }

  cambiarFecha() {
    this.cargarMetricas(true);
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.paginaActual + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
        this.paginaActual = nuevaPagina;
        
        // CORRECCIÓN: Usar false para que sea una carga suave de tabla
        this.cargarMetricas(false); 
    }
  }

  // 2. MODIFICAMOS LA FUNCIÓN PARA ACEPTAR EL PARÁMETRO
  cargarMetricas(isGlobalLoading: boolean) {
    
    if (isGlobalLoading) {
        this.loading = true; // Muestra el spinner grande y oculta todo
    } else {
        this.loadingTabla = true; // Solo "desactiva" la tabla visualmente
    }
    
    this.ventaService.getMetricasDia(this.fechaSeleccionada, this.paginaActual, this.limit).subscribe({
      next: (data) => {
        this.metricas = data;
        
        if (data.meta) {
            this.totalPaginas = data.meta.totalPages;
            this.paginaActual = data.meta.page;
        }
        
        // Apagamos ambos loadings
        this.loading = false;
        this.loadingTabla = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.loadingTabla = false;
        this.cd.detectChanges();
      }
    });
  }
}