import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { Venta } from '../../Interfaces/venta.interface';
import { ClienteService } from '../../services/cliente.service';

@Component({
  selector: 'app-venta-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './venta-list.html'
})
export class VentaListComponent implements OnInit {
  private ventaService = inject(VentaService);
  private clienteService = inject(ClienteService);

  ventas: Venta[] = [];
  clientesDisponibles: any[] = []; // Array para los filtros

  cargando: boolean = true;
  error: string | null = null;

  // Paginación
  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 1;

  // Filtros
  filtros = {
    estado: '',
    fechaInicio: '',
    fechaFin: '',
    cliente_id: '' // Guardamos el ID acá
  };

  // KPIs de la vista actual
  totalRecaudado: number = 0;

  ngOnInit() {
    this.cargarConfiguracionFechas();
    this.cargarVentas();
    this.cargarClientes(); // Cargamos para el combo
  }

  cargarConfiguracionFechas() {
    const ahora = new Date();
    // Por defecto hoy (inicio a fin del dia)
    this.filtros.fechaInicio = this.formatearFechaLocal(ahora);
    this.filtros.fechaFin = this.formatearFechaLocal(ahora);
  }

  formatearFechaLocal(fecha: Date): string {
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  cargarClientes() {
    this.clienteService.getClientes().subscribe({
      next: (res: any) => {
        this.clientesDisponibles = res.data;
      },
      error: (err) => console.error('Error cargando clientes', err)
    });
  }

  cargarVentas() {
    this.cargando = true;
    this.error = null;

    let fechaInicioStr: string | undefined = undefined;
    let fechaFinStr: string | undefined = undefined;

    if (this.filtros.fechaInicio && this.filtros.fechaFin) {
      fechaInicioStr = this.filtros.fechaInicio;
      fechaFinStr = this.filtros.fechaFin;
    }

    this.ventaService.getAll(
      this.page, 
      this.limit, 
      this.filtros.estado || undefined,
      fechaInicioStr,
      fechaFinStr,
      this.filtros.cliente_id || undefined // ENVIAMOS EL FILTRO AL BACKEND
    ).subscribe({
      next: (resp) => {
        this.ventas = resp.data;
        this.total = resp.meta.total;
        this.totalPages = resp.meta.totalPages;
        this.page = resp.meta.page;
        this.totalRecaudado = resp.meta.totalAmount;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al cargar ventas:', err);
        this.error = 'Ocurrió un error al cargar el historial de ventas.';
        this.cargando = false;
      }
    });
  }

  aplicarFiltros() {
    this.page = 1;
    this.cargarVentas();
  }

  limpiarFiltros() {
    this.filtros = {
      estado: '',
      fechaInicio: '',
      fechaFin: '',
      cliente_id: ''
    };
    this.cargarConfiguracionFechas();
    this.aplicarFiltros();
  }

  irAPagina(p: number) {
    if (p > 0 && p <= this.totalPages) {
      this.page = p;
      this.cargarVentas();
    }
  }

  cambiarLimit(nuevoLimit: string) {
    this.limit = parseInt(nuevoLimit);
    this.page = 1;
    this.cargarVentas();
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
