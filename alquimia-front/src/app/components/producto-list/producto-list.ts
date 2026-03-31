import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ProductoService, ProductoResponse } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { finalize } from 'rxjs/operators';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-producto-list',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './producto-list.html',
  styleUrl: './producto-list.css',
})
export class ProductoList implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);
  
  // SOLUCIÓN DEFINITIVA: Variable estática que sobrevive a la destrucción del componente
  static listState: any = null;
  isInitializing = true; // Escudo contra eventos fantasma de Angular
  
  loading = true;
  terminoBusqueda: string = '';
  verInactivos = false;

  mostrarFiltros: boolean = false;
  categoriasDisponibles: string[] = [];
  proveedoresDisponibles: string[] = [];

  filtros = {
    codigoProveedor: '',
    proveedorNombre: '',
    categoria: '',
    orden: 'nombre_asc'
  };

  productosOriginales: Producto[] = [];
  productosList: Producto[] = [];       
  productosPaginados: Producto[] = [];  

  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 0;

  get conteoFiltrosActivos(): number {
    let count = 0;
    if (this.filtros.codigoProveedor.trim() !== '') count++;
    if (this.filtros.proveedorNombre !== '') count++;
    if (this.filtros.categoria !== '') count++;
    return count;
  }

  ngOnInit(): void {
    this.restaurarEstado();
    this.cargarProductos();
  }

  // Se ejecuta EXACTAMENTE cuando abandonas la vista (ej: al darle a "Editar")
  ngOnDestroy(): void {
    this.guardarEstado();
  }

  // --- MÉTODOS DE MANEJO DE ESTADO ---
  restaurarEstado() {
    if (ProductoList.listState) {
      const state = ProductoList.listState;
      this.terminoBusqueda = state.terminoBusqueda || '';
      this.filtros = state.filtros ? { ...state.filtros } : { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
      this.mostrarFiltros = state.mostrarFiltros || false;
      this.verInactivos = state.verInactivos || false;
      this.page = state.page || 1;
    }
  }

  guardarEstado() {
    ProductoList.listState = {
      terminoBusqueda: this.terminoBusqueda,
      filtros: { ...this.filtros },
      mostrarFiltros: this.mostrarFiltros,
      verInactivos: this.verInactivos,
      page: this.page
    };
  }

  toggleFiltros() {
    this.mostrarFiltros = !this.mostrarFiltros;
  }
  // -----------------------------------

  descargarCatalogoPdf() {
    this.loading = true;
    this.notificationService.show('Generando catálogo PDF...', 'info');

    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (resp) => {
        this.crearDocumentoPdf(resp.data);
        this.loading = false;
        this.notificationService.show('PDF descargado con éxito', 'success');
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.notificationService.show('Error al generar el PDF', 'error');
        this.cd.detectChanges();
      }
    });
  }

  private crearDocumentoPdf(productos: Producto[]) {
    const productosPorCategoria: { [categoria: string]: Producto[] } = {};
    let valorTotalInventario = 0; 
    let totalStockUnidades = 0;   
    
    productos.forEach(prod => {
      const cat = prod.categoria || 'Sin Categoría';
      if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
      productosPorCategoria[cat].push(prod);

      const stock = prod.stock || 0;
      totalStockUnidades += stock;
      valorTotalInventario += stock * (prod.precio_efectivo || 0);
    });

    const categoriasOrdenadas = Object.keys(productosPorCategoria).sort();
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text('Catálogo de Productos', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); 
    doc.text(`Alquimia Home Deco  |  Generado el: ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}`, 14, 28);

    doc.setDrawColor(226, 232, 240); 
    doc.setLineWidth(0.5);
    doc.line(14, 32, pageWidth - 14, 32);

    let startY = 40; 

    categoriasOrdenadas.forEach((categoria) => {
      if (startY + 45 > pageHeight) { 
        doc.addPage();
        startY = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); 
      doc.text(categoria.toUpperCase(), 14, startY);
      startY += 6;

      const productosDeLaCategoria = productosPorCategoria[categoria];
      productosDeLaCategoria.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

      const datosTabla = productosDeLaCategoria.map(p => [
        p.codigo_barra || '-',
        p.nombre || '-',
        p.proveedor || '-',
        p.stock?.toString() || '0',
        `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Código', 'Producto', 'Proveedor', 'Stock', 'Precio Efvo.']],
        body: datosTabla,
        theme: 'striped',
        headStyles: { 
          fillColor: [15, 23, 42], 
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
        
        columnStyles: {
          0: { cellWidth: 25 }, 
          1: { cellWidth: 'auto' }, 
          2: { cellWidth: 35 }, 
          3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 
          4: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] } 
        },
        
        margin: { bottom: 25 }, 
        rowPageBreak: 'avoid',  
        showHead: 'everyPage'   
      });

      startY = (doc as any).lastAutoTable.finalY + 12; 
    });

    if (startY + 30 > pageHeight) { doc.addPage(); startY = 20; }
    
    doc.setDrawColor(15, 23, 42); 
    doc.setFillColor(248, 250, 252); 
    doc.roundedRect(14, startY, pageWidth - 28, 25, 3, 3, 'FD'); 
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('RESUMEN DEL INVENTARIO', 20, startY + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Artículos distintos: ${productos.length} refs.`, 20, startY + 15);
    doc.text(`Unidades físicas totales: ${totalStockUnidades} un.`, 20, startY + 20);
    
    /* doc.setFont('helvetica', 'bold'); */
    /* doc.text(`Valor de Venta Estimado: $ ${valorTotalInventario.toLocaleString('es-AR')}`, pageWidth - 20, startY + 15, { align: 'right' }); */

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184); 
      
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
      doc.text(
        `Página ${i} de ${pageCount}  -  Documento de uso interno`, 
        pageWidth / 2, 
        pageHeight - 8, 
        { align: 'center' }
      );
    }

    doc.save(`Catalogo_Alquimia_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  cargarProductos() {
    this.loading = true;
    this.isInitializing = true; // Subimos escudos
    
    this.productoService.getAll('', !this.verInactivos, 1, 10000).subscribe({
      next: (resp: ProductoResponse) => {
        this.productosOriginales = resp.data;
        this.extraerListasDesplegables(); 
        
        // Pasamos false para mantener la página en la que estábamos
        this.aplicarFiltros(false); 
        
        this.isInitializing = false; // Bajamos escudos
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar productos', err);
        this.isInitializing = false;
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  extraerListasDesplegables() {
    const cats = this.productosOriginales
      .map(p => p.categoria || '') 
      .filter(c => c.trim() !== ''); 
    this.categoriasDisponibles = [...new Set(cats)].sort();

    const provs = this.productosOriginales
      .map(p => p.proveedor || '') 
      .filter(p => p.trim() !== ''); 
    this.proveedoresDisponibles = [...new Set(provs)].sort();
  }

  // Se lanza cuando el HTML reporta un cambio, ignorándolo si estamos en inicialización
  alCambiarFiltroHTML() {
    if (this.isInitializing) return;
    this.aplicarFiltros(true);
  }

  aplicarFiltros(resetPage: boolean = true) {
    let filtrados = [...this.productosOriginales];
    
    const termino = (this.terminoBusqueda || '').toLowerCase().trim();
    const codProvFiltro = this.filtros.codigoProveedor.toLowerCase().trim();
    const provNombreFiltro = this.filtros.proveedorNombre;
    const catFiltro = this.filtros.categoria;

    if (termino !== '') {
      filtrados = filtrados.filter(p => 
        (p.nombre || '').toLowerCase().includes(termino) ||
        (p.codigo_barra || '').toLowerCase().includes(termino) ||
        (p.codigo_proveedor || '').toLowerCase().includes(termino)
      );
    }

    if (codProvFiltro !== '') {
      filtrados = filtrados.filter(p => 
        (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro)
      );
    }

    if (provNombreFiltro !== '') {
      filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    }

    if (catFiltro !== '') {
      filtrados = filtrados.filter(p => p.categoria === catFiltro);
    }

    filtrados.sort((a, b) => {
      switch (this.filtros.orden) {
        case 'nombre_asc':
          return (a.nombre || '').localeCompare(b.nombre || '');
        case 'nombre_desc':
          return (b.nombre || '').localeCompare(a.nombre || '');
        case 'precio_asc':
          return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
        case 'precio_desc':
          return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        default:
          return 0;
      }
    });

    this.productosList = filtrados;
    this.total = this.productosList.length;
    this.totalPages = Math.ceil(this.total / this.limit) || 1;
    
    if (resetPage) {
      this.page = 1; 
    } else {
      if (this.page > this.totalPages) this.page = this.totalPages;
      if (this.page < 1) this.page = 1;
    }

    this.actualizarVistaPaginada();
  }

  actualizarVistaPaginada() {
    const indiceInicio = (this.page - 1) * this.limit;
    const indiceFin = indiceInicio + this.limit;
    this.productosPaginados = this.productosList.slice(indiceInicio, indiceFin);
  }

  buscar() {
    this.alCambiarFiltroHTML();
  }

  limpiar() {
    this.terminoBusqueda = '';
    this.alCambiarFiltroHTML();
  }

  limpiarFiltrosAvanzados() {
    this.filtros = { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
    this.alCambiarFiltroHTML();
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.page + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
      this.page = nuevaPagina;
      this.actualizarVistaPaginada();
    }
  }

  toggleVista() {
    this.verInactivos = !this.verInactivos;
    this.terminoBusqueda = ''; 
    this.filtros = { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
    this.page = 1; 
    this.cargarProductos();
  }

  borrarProducto(id: number | undefined) {
    if(!id) return;
    if(confirm('¿Estás seguro de eliminar este producto?')) {
      this.loading = true;
      this.productoService.delete(id)
        .pipe(finalize(() => {
            this.loading = false;
            this.cd.detectChanges(); 
        }))
        .subscribe({
          next: () => {
            this.notificationService.show('Producto eliminado', 'error');
            this.cargarProductos(); 
          },
          error: () => {
             this.notificationService.show('No se pudo eliminar el producto', 'error');
          }
        });
    }
  }

  restaurarProducto(id: number | undefined) {
    if(!id) return;
    if(confirm('¿Deseas restaurar este producto?')) {
      this.loading = true;
      this.productoService.restaurar(id)
        .pipe(finalize(() => {
            this.loading = false;
            this.cd.detectChanges(); 
        }))
        .subscribe({
          next: () => {
            this.notificationService.show('Producto restaurado', 'success');
            this.cargarProductos(); 
          },
          error: () => {
            this.notificationService.show('No se pudo restaurar', 'error');
          }
        });
    }
  }

  trackByProductoId(index: number, producto: Producto): number {
    return producto.id!;
  }
}
// import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common'; 
// import { ProductoService, ProductoResponse } from '../../services/producto.service';
// import { Producto } from '../../Interfaces/producto.interface';
// import { RouterLink } from '@angular/router';
// import { FormsModule } from '@angular/forms';
// import { NotificationService } from '../../services/notification.service';
// import { finalize } from 'rxjs/operators';
// import { jsPDF } from 'jspdf';
// import autoTable from 'jspdf-autotable';


// @Component({
//   selector: 'app-producto-list',
//   imports: [CommonModule, RouterLink, FormsModule],
//   templateUrl: './producto-list.html',
//   styleUrl: './producto-list.css',
// })
// export class ProductoList implements OnInit {
//   private productoService = inject(ProductoService);
//   private notificationService = inject(NotificationService);
//   private cd = inject(ChangeDetectorRef);

//   static listState: any = null;
//   isInitializing = true;
  
//   loading = true;
//   terminoBusqueda: string = '';
//   verInactivos = false;

//   mostrarFiltros: boolean = false;
//   categoriasDisponibles: string[] = [];
//   proveedoresDisponibles: string[] = [];

//   filtros = {
//     codigoProveedor: '',
//     proveedorNombre: '',
//     categoria: '',
//     orden: 'nombre_asc'
//   };

//   productosOriginales: Producto[] = [];
//   productosList: Producto[] = [];       
//   productosPaginados: Producto[] = [];  

//   page: number = 1;
//   limit: number = 10;
//   total: number = 0;
//   totalPages: number = 0;

//   get conteoFiltrosActivos(): number {
//     let count = 0;
//     if (this.filtros.codigoProveedor.trim() !== '') count++;
//     if (this.filtros.proveedorNombre !== '') count++;
//     if (this.filtros.categoria !== '') count++;
//     return count;
//   }

//   ngOnInit(): void {
//     this.restaurarEstado();
//     this.cargarProductos();
//   }

//   descargarCatalogoPdf() {
//     this.loading = true;
//     this.notificationService.show('Generando catálogo PDF...', 'info');

//     // Pedimos TODOS los productos activos (límite alto como 10000)
//     this.productoService.getAll('', true, 1, 10000).subscribe({
//       next: (resp) => {
//         this.crearDocumentoPdf(resp.data);
//         this.loading = false;
//         this.notificationService.show('PDF descargado con éxito', 'success');
//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error(err);
//         this.loading = false;
//         this.notificationService.show('Error al generar el PDF', 'error');
//         this.cd.detectChanges();
//       }
//     });
//   }

//   private crearDocumentoPdf(productos: Producto[]) {
//     // 1. AGRUPACIÓN Y ORDENAMIENTO (Igual que antes)
//     const productosPorCategoria: { [categoria: string]: Producto[] } = {};
//     let valorTotalInventario = 0; // Para el resumen final
//     let totalStockUnidades = 0;   // Para el resumen final
    
//     productos.forEach(prod => {
//       const cat = prod.categoria || 'Sin Categoría';
//       if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
//       productosPorCategoria[cat].push(prod);

//       // Calculamos totales para el resumen
//       const stock = prod.stock || 0;
//       totalStockUnidades += stock;
//       valorTotalInventario += stock * (prod.precio_efectivo || 0);
//     });

//     const categoriasOrdenadas = Object.keys(productosPorCategoria).sort();
    
//     // 2. CONFIGURACIÓN DEL DOCUMENTO
//     const doc = new jsPDF();
//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
    
//     // Título Principal
//     doc.setFontSize(22);
//     doc.setTextColor(15, 23, 42); // Slate-900
//     doc.text('Catálogo de Productos', 14, 20);
    
//     doc.setFontSize(10);
//     doc.setTextColor(100, 116, 139); // Slate-500
//     doc.text(`Alquimia Home Deco  |  Generado el: ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}`, 14, 28);

//     // Línea separadora superior
//     doc.setDrawColor(226, 232, 240); // Slate-200
//     doc.setLineWidth(0.5);
//     doc.line(14, 32, pageWidth - 14, 32);

//     let startY = 40; 

//     // 3. DIBUJADO DE TABLAS POR CATEGORÍA
//     categoriasOrdenadas.forEach((categoria) => {
//       if (startY + 45 > pageHeight) { 
//         doc.addPage();
//         startY = 20;
//       }

//       // Título de la Categoría
//       doc.setFontSize(13);
//       doc.setFont('helvetica', 'bold');
//       doc.setTextColor(30, 41, 59); // Slate-800
//       doc.text(categoria.toUpperCase(), 14, startY);
//       startY += 6;

//       const productosDeLaCategoria = productosPorCategoria[categoria];
//       productosDeLaCategoria.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

//       const datosTabla = productosDeLaCategoria.map(p => [
//         p.codigo_barra || '-',
//         p.nombre || '-',
//         p.proveedor || '-',
//         p.stock?.toString() || '0',
//         `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
//       ]);

//       autoTable(doc, {
//         startY: startY,
//         head: [['Código', 'Producto', 'Proveedor', 'Stock', 'Precio Efvo.']],
//         body: datosTabla,
//         theme: 'striped',
//         headStyles: { 
//           fillColor: [15, 23, 42], // Fondo oscuro corporativo
//           textColor: [255, 255, 255],
//           fontStyle: 'bold'
//         },
//         styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, // Slate-700
        
//         // ¡MEJORA ALINEACIÓN Y ANCHOS!
//         columnStyles: {
//           0: { cellWidth: 25 }, // Código (fijo)
//           1: { cellWidth: 'auto' }, // Producto (Toma todo el espacio sobrante)
//           2: { cellWidth: 35 }, // Proveedor
//           3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Stock (Centrado y negrita)
//           4: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] } // Precio (Derecha, negrita, color esmeralda)
//         },
        
//         margin: { bottom: 25 }, // Dejamos más margen abajo para los números de página
//         rowPageBreak: 'avoid',  
//         showHead: 'everyPage'   
//       });

//       startY = (doc as any).lastAutoTable.finalY + 12; 
//     });

//     // 4. RESUMEN FINAL ESTADÍSTICO
//     if (startY + 30 > pageHeight) { doc.addPage(); startY = 20; }
    
//     doc.setDrawColor(15, 23, 42); // Borde oscuro
//     doc.setFillColor(248, 250, 252); // Fondo clarito (Slate-50)
//     doc.roundedRect(14, startY, pageWidth - 28, 25, 3, 3, 'FD'); // Caja con bordes redondeados
    
//     doc.setFontSize(11);
//     doc.setFont('helvetica', 'bold');
//     doc.setTextColor(15, 23, 42);
//     doc.text('RESUMEN DEL INVENTARIO', 20, startY + 8);
    
//     doc.setFontSize(9);
//     doc.setFont('helvetica', 'normal');
//     doc.text(`Artículos distintos: ${productos.length} refs.`, 20, startY + 15);
//     doc.text(`Unidades físicas totales: ${totalStockUnidades} un.`, 20, startY + 20);
    
//     doc.setFont('helvetica', 'bold');
//     /* doc.text(`Valor de Venta Estimado: $ ${valorTotalInventario.toLocaleString('es-AR')}`, pageWidth - 20, startY + 15, { align: 'right' }); */


//     // 5. NUMERACIÓN DE PÁGINAS (PIE DE PÁGINA)
//     const pageCount = (doc as any).internal.getNumberOfPages();
//     for (let i = 1; i <= pageCount; i++) {
//       doc.setPage(i);
//       doc.setFontSize(8);
//       doc.setFont('helvetica', 'italic');
//       doc.setTextColor(148, 163, 184); // Slate-400
      
//       // Línea separadora del pie de página
//       doc.setDrawColor(226, 232, 240);
//       doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
//       // Texto "Página X de Y" centrado
//       doc.text(
//         `Página ${i} de ${pageCount}  -  Documento de uso interno`, 
//         pageWidth / 2, 
//         pageHeight - 8, 
//         { align: 'center' }
//       );
//     }

//     // 6. GUARDAR
//     doc.save(`Catalogo_Alquimia_${new Date().toISOString().split('T')[0]}.pdf`);
//   }

//   restaurarEstado() {
//     if (ProductoList.listState) {
//       const state = ProductoList.listState;
//       this.terminoBusqueda = state.terminoBusqueda || '';
//       this.filtros = state.filtros ? { ...state.filtros } : { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
//       this.mostrarFiltros = state.mostrarFiltros || false;
//       this.verInactivos = state.verInactivos || false;
//       this.page = state.page || 1;
//     }
//   }

//   guardarEstado() {
//     ProductoList.listState = {
//       terminoBusqueda: this.terminoBusqueda,
//       filtros: { ...this.filtros },
//       mostrarFiltros: this.mostrarFiltros,
//       verInactivos: this.verInactivos,
//       page: this.page
//     };
//   }

//   toggleFiltros() {
//     this.mostrarFiltros = !this.mostrarFiltros;
//   }


//   cargarProductos() {
//     this.loading = true;
//     this.isInitializing = true; // Subimos escudos
    
//     // Traemos un límite alto (10000) para hacer la búsqueda local instantánea
//     this.productoService.getAll('', !this.verInactivos, 1, 10000).subscribe({
//       next: (resp: ProductoResponse) => {
//         this.productosOriginales = resp.data;
//         this.extraerListasDesplegables(); 
//         this.aplicarFiltros(); 
//         this.isInitializing = false; // Bajamos escudos
//         this.loading = false;
//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error('Error al cargar productos', err);
//         this.loading = false;
//         this.cd.detectChanges();
//       }
//     });
//   }

//   extraerListasDesplegables() {
//     // 1. Extraer y ordenar Categorías únicas
//     const cats = this.productosOriginales
//       .map(p => p.categoria || '') 
//       .filter(c => c.trim() !== ''); 
//     this.categoriasDisponibles = [...new Set(cats)].sort();

//     // 2. Extraer y ordenar Nombres de Proveedores únicos
//     const provs = this.productosOriginales
//       .map(p => p.proveedor || '') 
//       .filter(p => p.trim() !== ''); 
//     this.proveedoresDisponibles = [...new Set(provs)].sort();
//   }

//   alCambiarFiltroHTML() {
//     if (this.isInitializing) return;
//     this.aplicarFiltros(true);
//   }

//   aplicarFiltros(resetPage: boolean = true) {
//     let filtrados = [...this.productosOriginales];
    
//     const termino = (this.terminoBusqueda || '').toLowerCase().trim();
//     const codProvFiltro = this.filtros.codigoProveedor.toLowerCase().trim();
//     const provNombreFiltro = this.filtros.proveedorNombre;
//     const catFiltro = this.filtros.categoria;

//     if (termino !== '') {
//       filtrados = filtrados.filter(p => 
//         (p.nombre || '').toLowerCase().includes(termino) ||
//         (p.codigo_barra || '').toLowerCase().includes(termino) ||
//         (p.codigo_proveedor || '').toLowerCase().includes(termino)
//       );
//     }

//     if (codProvFiltro !== '') {
//       filtrados = filtrados.filter(p => 
//         (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro)
//       );
//     }

//     if (provNombreFiltro !== '') {
//       filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
//     }

//     if (catFiltro !== '') {
//       filtrados = filtrados.filter(p => p.categoria === catFiltro);
//     }

//     filtrados.sort((a, b) => {
//       switch (this.filtros.orden) {
//         case 'nombre_asc':
//           return (a.nombre || '').localeCompare(b.nombre || '');
//         case 'nombre_desc':
//           return (b.nombre || '').localeCompare(a.nombre || '');
//         case 'precio_asc':
//           return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
//         case 'precio_desc':
//           return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
//         default:
//           return 0;
//       }
//     });

//     this.productosList = filtrados;
//     this.total = this.productosList.length;
//     this.totalPages = Math.ceil(this.total / this.limit) || 1;
    
//     if (resetPage) {
//       this.page = 1; 
//     } else {
//       if (this.page > this.totalPages) this.page = this.totalPages;
//       if (this.page < 1) this.page = 1;
//     }

//     this.actualizarVistaPaginada();
//   }
  
//   aplicarFiltros() {
//     let filtrados = [...this.productosOriginales];
    
//     const termino = (this.terminoBusqueda || '').toLowerCase().trim();
//     const codProvFiltro = this.filtros.codigoProveedor.toLowerCase().trim();
//     const provNombreFiltro = this.filtros.proveedorNombre;
//     const catFiltro = this.filtros.categoria;

//     // Filtro Global
//     if (termino !== '') {
//       filtrados = filtrados.filter(p => 
//         (p.nombre || '').toLowerCase().includes(termino) ||
//         (p.codigo_barra || '').toLowerCase().includes(termino) ||
//         (p.codigo_proveedor || '').toLowerCase().includes(termino)
//       );
//     } 

//     // Filtro por Código de Proveedor (Input texto)
//     if (codProvFiltro !== '') {
//       filtrados = filtrados.filter(p => 
//         (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro)
//       );
//     }

//     // Filtro por Nombre del Proveedor (Select Desplegable)
//     if (provNombreFiltro !== '') {
//       filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
//     }

//     // Filtro por Categoría (Select Desplegable)
//     if (catFiltro !== '') {
//       filtrados = filtrados.filter(p => p.categoria === catFiltro);
//     }

//     // Ordenamiento
//     filtrados.sort((a, b) => {
//       switch (this.filtros.orden) {
//         case 'nombre_asc':
//           return (a.nombre || '').localeCompare(b.nombre || '');
//         case 'nombre_desc':
//           return (b.nombre || '').localeCompare(a.nombre || '');
//         case 'precio_asc':
//           return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
//         case 'precio_desc':
//           return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
//         default:
//           return 0;
//       }
//     });

//     this.productosList = filtrados;

//     // Actualizamos la paginación según los resultados obtenidos
//     this.total = this.productosList.length;
//     this.totalPages = Math.ceil(this.total / this.limit) || 1;
//     this.page = 1; 

//     this.actualizarVistaPaginada();
//   }

//   actualizarVistaPaginada() {
//     const indiceInicio = (this.page - 1) * this.limit;
//     const indiceFin = indiceInicio + this.limit;
//     this.productosPaginados = this.productosList.slice(indiceInicio, indiceFin);
//   }

//   buscar() {
//     this.aplicarFiltros();
//   }

//   limpiar() {
//     this.terminoBusqueda = '';
//     this.aplicarFiltros();
//   }

//   limpiarFiltrosAvanzados() {
//     this.filtros = { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
//     this.aplicarFiltros();
//   }

//   cambiarPagina(delta: number) {
//     const nuevaPagina = this.page + delta;
//     if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
//       this.page = nuevaPagina;
//       this.actualizarVistaPaginada();
//     }
//   }

//   toggleVista() {
//     this.verInactivos = !this.verInactivos;
//     this.terminoBusqueda = ''; 
//     this.limpiarFiltrosAvanzados();
//     this.page = 1; 
//     this.cargarProductos();
//   }

//   borrarProducto(id: number | undefined) {
//     if(!id) return;
//     if(confirm('¿Estás seguro de eliminar este producto?')) {
//       this.loading = true;
//       this.productoService.delete(id)
//         .pipe(finalize(() => {
//             this.loading = false;
//             this.cd.detectChanges(); 
//         }))
//         .subscribe({
//           next: () => {
//             this.notificationService.show('Producto eliminado', 'error');
//             this.cargarProductos(); 
//           },
//           error: () => {
//              this.notificationService.show('No se pudo eliminar el producto', 'error');
//           }
//         });
//     }
//   }

//   restaurarProducto(id: number | undefined) {
//     if(!id) return;
//     if(confirm('¿Deseas restaurar este producto?')) {
//       this.loading = true;
//       this.productoService.restaurar(id)
//         .pipe(finalize(() => {
//             this.loading = false;
//             this.cd.detectChanges(); 
//         }))
//         .subscribe({
//           next: () => {
//             this.notificationService.show('Producto restaurado', 'success');
//             this.cargarProductos(); 
//           },
//           error: () => {
//             this.notificationService.show('No se pudo restaurar', 'error');
//           }
//         });
//     }
//   }

//   // Optimización súper clave para *ngFor
//   trackByProductoId(index: number, producto: Producto): number {
//     return producto.id!;
//   }
// }
