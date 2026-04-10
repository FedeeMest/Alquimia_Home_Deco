import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { ClienteService } from '../../services/cliente.service'; 
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
  private clienteService = inject(ClienteService); 
  private notif = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);
  
  ventas: Venta[] = [];
  ventasFiltradas: Venta[] = [];
  
  loading = true;
  filtroEstado: 'COBRADA' | 'PENDIENTE' | 'ANULADA' = 'COBRADA';

  // --- VARIABLES PARA EL FILTRO ---
  fechaDesde: string = '';
  fechaHasta: string = '';
  clienteIdFiltro: string = ''; 
  clientes: any[] = [];         
  
  paginaActual = 1;
  totalPaginas = 1;
  totalItems = 0;
  limitePorPagina = 10;
  totalVentas: number = 0;

  ngOnInit() {
    this.cargarClientes(); 
    this.cargarVentas();
  }

  cargarClientes() {
    this.clienteService.getClientes().subscribe({
      next: (res: any) => {
        this.clientes = res.data;
      },
      error: (err) => console.error('Error cargando clientes:', err)
    });
  }

  limpiarFiltros() {
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.clienteIdFiltro = '';
    this.paginaActual = 1;
    this.cargarVentas(); 
    this.notif.show('Filtros eliminados', 'info');
  }

  cargarVentas() {
    this.loading = true;
    
    // Le pasamos el clienteIdFiltro al servicio 
    this.ventaService.getAll(
        this.paginaActual, 
        this.limitePorPagina, 
        this.filtroEstado, 
        this.fechaDesde, 
        this.fechaHasta,
        this.clienteIdFiltro
    ).subscribe({
      next: (resp: any) => { 
        this.ventas = resp.data; 
        
        this.totalItems = resp.meta.total;
        this.totalPaginas = resp.meta.totalPages || Math.ceil(resp.meta.total / this.limitePorPagina);
        this.paginaActual = resp.meta.page;

        this.totalVentas = Number(resp.meta.totalAmount) || 0;

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
    this.paginaActual = 1;
    this.cargarVentas();
  }

  cambiarFiltro(estado: 'COBRADA' | 'PENDIENTE' | 'ANULADA') {
    this.filtroEstado = estado;
    this.paginaActual = 1; 
    this.cargarVentas();
  }

  anularVenta(id: number) {
    if (!confirm('¿Estás seguro de anular esta venta? Los productos volverán al stock.')) return;
    this.ventaService.anular(id).subscribe({
      next: () => {
        this.notif.show('Venta anulada. Stock devuelto.', 'success');
        this.cargarVentas(); 
      },
      error: (err) => console.error(err)
    });
  }

  cobrarVenta(id: number) {
    if (!confirm('¿Confirmas que el cliente ha pagado esta deuda? La venta pasará a estado COBRADA.')) return;

    // ACÁ ESTABA EL ERROR. Volví a usar 'cobrar' como tenías vos originalmente
    this.ventaService.cobrar(id).subscribe({
      next: () => {
        this.notif.show('Deuda saldada correctamente', 'success');
        this.cargarVentas(); 
      },
      error: (err) => {
        console.error(err);
        this.notif.show('Error al cobrar venta', 'error');
      }
    });
  }
}

// import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { RouterLink } from '@angular/router';
// import { VentaService } from '../../services/venta.service';
// import { NotificationService } from '../../services/notification.service';
// import { ClienteService } from '../../services/cliente.service'; // NUEVO
// import { Venta } from '../../Interfaces/venta.interface';
// import { FormsModule } from '@angular/forms';

// @Component({
//   selector: 'app-venta-list',
//   standalone: true,
//   imports: [CommonModule, RouterLink, FormsModule],
//   templateUrl: './venta-list.html'
// })
// export class VentaListComponent implements OnInit {
//   private ventaService = inject(VentaService);
//   private clienteService = inject(ClienteService); // NUEVO
//   private notif = inject(NotificationService);
//   private cd = inject(ChangeDetectorRef);
  
//   ventas: Venta[] = [];
//   ventasFiltradas: Venta[] = [];
  
//   loading = true;
//   filtroEstado: 'COBRADA' | 'PENDIENTE' | 'ANULADA' = 'COBRADA';

//   // --- VARIABLES PARA EL FILTRO ---
//   fechaDesde: string = '';
//   fechaHasta: string = '';
//   clienteIdFiltro: string = ''; // NUEVO: Para saber qué cliente seleccionó
//   clientes: any[] = [];         // NUEVO: La lista de clientes para el select
  
//   paginaActual = 1;
//   totalPaginas = 1;
//   totalItems = 0;
//   limitePorPagina = 10;
//   totalVentas: number = 0;

//   ngOnInit() {
//     this.cargarClientes(); // Traemos las opciones de feria primero
//     this.cargarVentas();
//   }

//   cargarClientes() {
//     this.clienteService.getClientes().subscribe({
//       next: (res: any) => {
//         this.clientes = res.data;
//       },
//       error: (err) => console.error('Error cargando clientes:', err)
//     });
//   }

//   limpiarFiltros() {
//     this.fechaDesde = '';
//     this.fechaHasta = '';
//     this.clienteIdFiltro = '';
//     this.paginaActual = 1;
//     this.cargarVentas(); 
//     this.notif.show('Filtros eliminados', 'info');
//   }

//   cargarVentas() {
//     this.loading = true;
    
//     // Le pasamos el clienteIdFiltro al servicio (mirá el paso 4 abajo)
//     this.ventaService.getAll(
//         this.paginaActual, 
//         this.limitePorPagina, 
//         this.filtroEstado, 
//         this.fechaDesde, 
//         this.fechaHasta,
//         this.clienteIdFiltro
//     ).subscribe({
//       next: (resp: any) => { 
//         this.ventas = resp.data; 
        
//         this.totalItems = resp.meta.total;
//         this.totalPaginas = resp.meta.totalPages || Math.ceil(resp.meta.total / this.limitePorPagina);
//         this.paginaActual = resp.meta.page;

//         this.totalVentas = Number(resp.meta.totalAmount) || 0;

//         this.loading = false;
//         this.cd.detectChanges();
//       },
//       error: (err) => { 
//           console.error(err); 
//           this.loading = false; 
//           this.notif.show('Error al cargar ventas', 'error');
//       }
//     });
//   }

//   cambiarPagina(delta: number) {
//     const nuevaPagina = this.paginaActual + delta;
//     if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
//         this.paginaActual = nuevaPagina;
//         this.cargarVentas();
//     }
//   }
  
//   buscarPorRango() {
//     this.paginaActual = 1;
//     this.cargarVentas();
//   }

//   cambiarFiltro(estado: 'COBRADA' | 'PENDIENTE' | 'ANULADA') {
//     this.filtroEstado = estado;
//     this.paginaActual = 1; 
//     this.cargarVentas();
//   }

//   anularVenta(id: number) {
//     if (!confirm('¿Estás seguro de anular esta venta?')) return;
//     this.ventaService.anular(id).subscribe({
//       next: () => {
//         this.notif.show('Venta anulada', 'success');
//         this.cargarVentas(); 
//       },
//       error: (err) => console.error(err)
//     });
//   }

//   cobrarVenta(id: number) {
//     if (!confirm('¿Confirmas que el cliente ha pagado esta deuda? La venta pasará a estado COBRADA.')) return;

//     this.ventaService.cobrar(id).subscribe({
//       next: () => {
//         this.notif.show('Deuda saldada correctamente', 'success');
//         this.cargarVentas(); 
//       },
//       error: (err) => {
//         console.error(err);
//         this.notif.show('Error al cobrar venta', 'error');
//       }
//     });
//   }
// }
