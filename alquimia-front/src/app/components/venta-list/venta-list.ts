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
  verAnuladas = false; // Controla el "switch" de vistas

  // Variables para el filtro
  fechaDesde: string = '';
  fechaHasta: string = '';
  totalFiltrado = 0; // Para mostrar la suma de lo que buscaste

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
    this.ventaService.getAll().subscribe({
      next: (data) => {
        this.ventas = data;
        this.filtrarVentas(); 
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => { console.error(err); this.loading = false; }
    });
  }

  buscarPorRango() {
    if (!this.fechaDesde || !this.fechaHasta) {
        this.notif.show('Selecciona ambas fechas', 'error');
        return;
    }

    this.loading = true;
    this.ventaService.filtrarPorFechas(this.fechaDesde, this.fechaHasta).subscribe({
        next: (response) => {
            // El backend devuelve { data: ventas[], resumen: { total, ... } }
            this.ventas = response.data;
            this.totalFiltrado = response.resumen.total;
            this.filtrarVentas();
            this.loading = false;
            this.notif.show(`Se encontraron ${this.ventas.length} ventas`, 'success');
        },
        error: (err) => {
            console.error(err);
            this.loading = false;
            this.notif.show('Error al buscar', 'error');
        }
    });
  }

  // Alternar entre ver activas o anuladas
  toggleVista() {
    this.verAnuladas = !this.verAnuladas;
    this.filtrarVentas();
  }

  filtrarVentas() {
    if (this.verAnuladas) {
      this.ventasFiltradas = this.ventas.filter(v => v.estado === 'ANULADA');
    } else {
      this.ventasFiltradas = this.ventas.filter(v => v.estado === 'ACTIVA');
    }
  }

  anularVenta(id: number) {
    if (!confirm('¿Estás seguro de anular esta venta? Se devolverá el stock.')) return;

    this.ventaService.anular(id).subscribe({
      next: () => {
        this.notif.show('Venta anulada correctamente', 'success');
        this.cargarVentas(); // Recargar para actualizar la lista
      },
      error: (err) => {
        console.error(err);
        this.notif.show('Error al anular venta', 'error');
      }
    });
  }
}