import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VentaService } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { ClienteService } from '../../services/cliente.service'; 
import { Venta } from '../../Interfaces/venta.interface';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


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
  private notificationService = inject(NotificationService);
  
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

 exportarPDF() {
  // 1. Llamamos a getAll pidiendo 10.000 registros para asegurarnos de traer todo el historial
  // Le pasamos exactamente las variables vinculadas a tus inputs de filtro en el HTML
  this.ventaService.getAll(
    1, 
    10000, 
    this.filtroEstado, 
    this.fechaDesde, 
    this.fechaHasta, 
    this.clienteIdFiltro
  ).subscribe({
    next: (res: any) => {
      // 2. Extraemos el arreglo completo de ventas que nos devuelve el backend
      const todasLasVentas = res.data; 

      if (!todasLasVentas || todasLasVentas.length === 0) {
        this.notificationService.warning('No hay ventas para exportar con los filtros actuales.');
        return;
      }

      // 3. Generamos el documento PDF
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text('Reporte General de Ventas - Alquimia Home Deco', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 14, 30);

      const columnas = [['Fecha', 'Cliente', 'Método de Pago', 'Total']];

      // 4. Armamos las filas iterando sobre TODAS las ventas, no solo las de la tabla visual
      const filas = todasLasVentas.map((venta: any) => {
        // Aseguramos que la fecha se formatee correctamente
        const fechaFormateada = new Date(venta.fecha).toLocaleDateString();
        
        return [
          fechaFormateada, 
          venta.cliente?.nombre || 'Consumidor Final',
          venta.metodo_pago === 'TARJETA_LOCAL' ? 'T. Local' : (venta.metodo_pago || '-'),
          `$${venta.total}`
        ];
      });

      autoTable(doc, {
        head: columnas,
        body: filas,
        startY: 35,
        theme: 'striped',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 10,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      });

      // 5. Descargamos el archivo
      doc.save('Reporte_Ventas_Alquimia.pdf');
    },
    error: (err) => {
      console.error('Error al obtener el historial para el PDF:', err);
      this.notificationService.error('Hubo un error al generar el reporte de ventas.');
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
