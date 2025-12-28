import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service'; // Asegúrate de tener esto
import { Venta } from '../../Interfaces/venta.interface';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-venta-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './venta-list.html'
})
export class VentaListComponent implements OnInit {
  private ventaService = inject(VentaService);
  private notif = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);
  
  ventas: Venta[] = [];
  ventasFiltradas: Venta[] = []; // Nueva lista para mostrar
  
  loading = true;
  filtroEstado: 'COBRADA' | 'PENDIENTE' | 'ANULADA' = 'COBRADA'; // Controla el "switch" de vistas

  // Variables para el filtro
  fechaDesde: string = '';
  fechaHasta: string = '';
  totalFiltrado = 0; // Para mostrar la suma de lo que buscaste

  paginaActual = 1;
  totalPaginas = 1;
  totalItems = 0;
  limitePorPagina = 10; // Puedes cambiarlo a 20 o 50

  ngOnInit() {
    this.establecerFechasPorDefecto();
    this.cargarVentas()

  }
  establecerFechasPorDefecto() {
    const hoy = new Date();
    // Formato YYYY-MM-DD para el input type="date"
    this.fechaHasta = hoy.toISOString().split('T')[0];
    
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.fechaDesde = haceUnMes.toISOString().split('T')[0];
  }

  cargarVentas() {
    this.loading = true;
    
    // Llamamos al servicio pasando TODOS los parámetros
    this.ventaService.getAll(
        this.paginaActual, 
        this.limitePorPagina, 
        this.filtroEstado, 
        this.fechaDesde, 
        this.fechaHasta
    ).subscribe({
      next: (resp) => {
        this.ventas = resp.data; // Solo cargamos los datos de esta página
        
        // Actualizamos info de paginación
        this.totalItems = resp.meta.total;
        this.totalPaginas = resp.meta.totalPages;
        this.paginaActual = resp.meta.page; // Por seguridad

        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => { 
          console.error(err); 
          this.loading = false; 
          this.notif.show('Error al cargar ventas', 'error');
      }
    });
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.paginaActual + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
        this.paginaActual = nuevaPagina;
        this.cargarVentas();
    }
  }
  

  buscarPorRango() {
    if (!this.fechaDesde || !this.fechaHasta) {
        this.notif.show('Selecciona ambas fechas', 'error');
        return;
    }
    this.paginaActual = 1;
    this.cargarVentas();
  }

  // Alternar entre ver activas o anuladas
  toggleVista() {
    this.filtroEstado = this.filtroEstado === 'COBRADA' ? 'ANULADA' : 'COBRADA';
    this.filtrarVentas();
  }

  filtrarVentas() {
    // Filtramos según la variable filtroEstado
    this.ventasFiltradas = this.ventas.filter(v => v.estado === this.filtroEstado);
  }

  cambiarFiltro(estado: 'COBRADA' | 'PENDIENTE' | 'ANULADA') {
    this.filtroEstado = estado;
    this.paginaActual = 1; 
    this.cargarVentas();
  }

  anularVenta(id: number) {
    if (!confirm('¿Estás seguro de anular esta venta?')) return;
    this.ventaService.anular(id).subscribe({
      next: () => {
        this.notif.show('Venta anulada', 'success');
        this.cargarVentas(); 
      },
      error: (err) => console.error(err)
    });
  }
}