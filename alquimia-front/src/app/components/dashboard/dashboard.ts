import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VentaService } from '../../services/venta.service';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  fechaDesde: string = '';
  fechaHasta: string = '';

  productosMasVendidos: any[] = [];

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

  filtrarEstadisticas() {
    if (!this.fechaDesde || !this.fechaHasta) {
      alert('Por favor, seleccioná ambas fechas.');
      return;
    }
    console.log(`Buscando datos desde ${this.fechaDesde} hasta ${this.fechaHasta}...`);
    // Acá llamarías a tu this.ventaService.getEstadisticas(desde, hasta)...
  }

  imprimirInforme() {
    // 1. Creamos el documento (formato A4)
    const doc = new jsPDF();

    // 2. Configuramos el Título Principal
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Informe de Ventas - Alquimia Home Deco', 14, 22);

    // 3. Configuramos los Subtítulos (Fechas)
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // slate-500
    const textoFechas = (this.fechaDesde && this.fechaHasta) 
      ? `Período analizado: ${this.fechaDesde} al ${this.fechaHasta}` 
      : 'Período analizado: Histórico completo';
    doc.text(textoFechas, 14, 30);

    // 4. Creamos la Tabla usando jspdf-autotable
    autoTable(doc, {
      startY: 40,
      head: [['Producto', 'Unidades Vendidas', 'Total Recaudado']],
      body: this.productosMasVendidos.map(p => [
        p.nombre, 
        p.cantidad.toString(), 
        `$ ${p.recaudado.toLocaleString('es-AR')}`
      ]),
      // Estilos para que quede premium y combine con tu marca
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' }, // slate-900
      alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
      styles: { fontSize: 10, cellPadding: 6 },
    });

    // 5. Pie de página con fecha de impresión
    const fechaImpresion = new Date().toLocaleDateString('es-AR');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Generado el: ${fechaImpresion}`, 14, doc.internal.pageSize.height - 10);

    // 6. Descargar el archivo
    doc.save(`Alquimia_Reporte_${this.fechaDesde}_al_${this.fechaHasta}.pdf`);
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