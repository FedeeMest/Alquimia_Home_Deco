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
  this.ventaService.getAll(
    1, 
    10000, 
    this.filtroEstado, 
    this.fechaDesde, 
    this.fechaHasta, 
    this.clienteIdFiltro
  ).subscribe({
    next: (res: any) => {
      const todasLasVentas = res.data; 

      if (!todasLasVentas || todasLasVentas.length === 0) {
        this.notificationService.warning('No hay ventas para exportar con los filtros actuales.');
        return;
      }

      const doc = new jsPDF();

      // Título y Fecha
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text('Reporte General de Ventas - Alquimia Home Deco', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 14, 30);

      const columnas = [['Fecha', 'Cliente', 'Método de Pago', 'Total']];

      // Variables para los cálculos del resumen
      let sumaTotal = 0;
      let sumaEfectivo = 0;
      let sumaTarjeta = 0;

      const filas = todasLasVentas.map((venta: any) => {
        const fechaFormateada = new Date(venta.fecha).toLocaleDateString();
        const totalVenta = Number(venta.total) || 0;
        
        // Sumamos al total general
        sumaTotal += totalVenta;
        
        // Clasificamos por método de pago
        if (venta.metodo_pago === 'EFECTIVO') {
          sumaEfectivo += totalVenta;
        } else if (venta.metodo_pago && venta.metodo_pago.includes('TARJETA')) {
          sumaTarjeta += totalVenta;
        }
        
        return [
          fechaFormateada, 
          venta.cliente?.nombre || 'Consumidor Final',
          venta.metodo_pago === 'TARJETA_LOCAL' ? 'T. Local' : (venta.metodo_pago || '-'),
          `$${totalVenta}`
        ];
      });

      // Dibujar la tabla principal
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

      // ==========================================
      // SECCIÓN DE RESUMEN FINAL
      // ==========================================
      
// Obtenemos la posición Y donde terminó la tabla
      let finalY = (doc as any).lastAutoTable.finalY + 15; 
      
      if (finalY > 250) {
          doc.addPage();
          finalY = 20; 
      }

      // Título del cuadro de resumen
      doc.setFontSize(14);
      doc.setTextColor(40);
      doc.setFont("helvetica", "bold");
      doc.text('Resumen de Operaciones', 14, finalY);

      // Línea separadora (ahora más ancha, llega hasta el punto 110)
      doc.setDrawColor(41, 128, 185);
      doc.setLineWidth(0.5);
      doc.line(14, finalY + 3, 110, finalY + 3);

      // Desglose de información
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);

      // Usamos X = 105 para alinear los números a la derecha pero mucho más lejos del texto
      doc.text(`Cantidad total de ventas:`, 14, finalY + 12);
      doc.text(`${todasLasVentas.length}`, 105, finalY + 12, { align: 'right' });

      doc.text(`Ingresos en Efectivo:`, 14, finalY + 20);
      doc.text(`$${sumaEfectivo.toLocaleString('es-AR')}`, 105, finalY + 20, { align: 'right' });

      doc.text(`Ingresos con Tarjeta:`, 14, finalY + 28);
      doc.text(`$${sumaTarjeta.toLocaleString('es-AR')}`, 105, finalY + 28, { align: 'right' });
      
      // Caja de Total General destacado (hacemos la caja más ancha: 96 de ancho)
      doc.setFillColor(245, 248, 250); 
      doc.rect(14, finalY + 35, 96, 12, 'F');
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185); 
      doc.text(`RECAUDACIÓN TOTAL:`, 16, finalY + 43);
      // El total también lo tiramos hasta X = 105
      doc.text(`$${sumaTotal.toLocaleString('es-AR')}`, 105, finalY + 43, { align: 'right' });

      // Descargamos el archivo
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
