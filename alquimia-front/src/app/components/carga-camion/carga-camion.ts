import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ProductoService, ProductoResponse } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-carga-camion',
  imports: [CommonModule, FormsModule],
  templateUrl: './carga-camion.html'
})
export class CargaCamionComponent implements OnInit {
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);
  
  loading = true;
  terminoBusqueda: string = '';
  
  vistaActual: 'todos' | 'camion' | 'almacen' = 'todos';
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
    this.cargarProductos();
  }

  generarPdfCarga() {
    // 1. Filtramos SOLO los productos que están en el camión
    const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

    if (enCamion.length === 0) {
        this.notificationService.show('El camión está vacío. No hay mercadería para imprimir.', 'error');
        return;
    }

    this.notificationService.show('Generando planilla de carga...', 'info');

    // 2. Ordenamos alfabéticamente para facilitar la búsqueda visual
    enCamion.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 3. Encabezado del Documento
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Planilla de Control de Carga', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Alquimia Home Deco  |  Generado el: ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}`, 14, 28);

    // 4. Resumen Logístico
    const totalUnidades = enCamion.reduce((acc, p) => acc + (p.stock_camion || 0), 0);
    
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138); // blue-900
    doc.setFont('helvetica', 'bold');
    doc.text(`Resumen: ${enCamion.length} artículos distintos  |  Total a transportar: ${totalUnidades} unidades.`, 14, 36);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 40, pageWidth - 14, 40);

    // 5. Mapeo de datos para la tabla
    const datos = enCamion.map(p => [
        p.codigo_barra || '-',
        p.nombre || '-',
        p.categoria || 'General',
        p.stock_camion?.toString() || '0',
        '' // Celda vacía a propósito para que el usuario escriba o haga un tilde
    ]);

    // 6. Generación de la Tabla
    autoTable(doc, {
        startY: 45,
        head: [['Cód. Barras', 'Producto', 'Categoría', 'Cantidad', 'Control (✓)']],
        body: datos,
        theme: 'grid', // Usamos 'grid' para que queden las celdas marcadas para escribir
        headStyles: { 
            fillColor: [30, 64, 175], // blue-800
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 35, fontStyle: 'normal' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 35 },
            3: { cellWidth: 25, halign: 'center', fontStyle: 'bold', textColor: [29, 78, 216], fillColor: [239, 246, 255] }, // Resaltamos la cantidad en azul claro
            4: { cellWidth: 25 } // Espacio en blanco para la firma/tilde
        },
        styles: { fontSize: 9, cellPadding: 4, textColor: [51, 65, 83] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        
        // Paginación
        didDrawPage: function (data) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(148, 163, 184); 
            doc.text(
                `Página ${data.pageNumber}  -  Firma del responsable: _______________________`, 
                pageWidth / 2, 
                pageHeight - 10, 
                { align: 'center' }
            );
        }
    });

    doc.save(`Hoja_Ruta_Camion_${new Date().toISOString().split('T')[0]}.pdf`);
    this.notificationService.show('Planilla PDF generada con éxito', 'success');
  }

  cargarProductos() {
    this.loading = true;
    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (resp: ProductoResponse) => {
        this.productosOriginales = resp.data;
        this.extraerListasDesplegables(); 
        this.aplicarFiltros(); 
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar', err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  extraerListasDesplegables() {
    const cats = this.productosOriginales.map(p => p.categoria || '').filter(c => c.trim() !== ''); 
    this.categoriasDisponibles = [...new Set(cats)].sort();
    const provs = this.productosOriginales.map(p => p.proveedor || '').filter(p => p.trim() !== ''); 
    this.proveedoresDisponibles = [...new Set(provs)].sort();
  }

  cambiarVistaTabs(vista: 'todos' | 'camion' | 'almacen') {
    this.vistaActual = vista;
    this.aplicarFiltros();
  }
  
  aplicarFiltros() {
    let filtrados = [...this.productosOriginales];
    
    if (this.vistaActual === 'camion') {
        filtrados = filtrados.filter(p => (p.stock_camion || 0) > 0);
    } else if (this.vistaActual === 'almacen') {
        filtrados = filtrados.filter(p => ((p.stock || 0) - (p.stock_camion || 0)) > 0);
    }

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
    if (codProvFiltro !== '') filtrados = filtrados.filter(p => (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro));
    if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

    // --- LÓGICA DE ORDENAMIENTO ACTUALIZADA ---
    filtrados.sort((a, b) => {
      // Variables auxiliares para el ordenamiento de stock
      const stockGralA = a.stock || 0;
      const stockGralB = b.stock || 0;
      const stockCamionA = a.stock_camion || 0;
      const stockCamionB = b.stock_camion || 0;
      const stockAlmacenA = stockGralA - stockCamionA;
      const stockAlmacenB = stockGralB - stockCamionB;

      switch (this.filtros.orden) {
        // Ordenamiento original
        case 'nombre_asc': return (a.nombre || '').localeCompare(b.nombre || '');
        case 'nombre_desc': return (b.nombre || '').localeCompare(a.nombre || '');
        case 'precio_asc': return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
        case 'precio_desc': return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        
        // NUEVO: Ordenamiento por Stock General
        case 'stock_general_asc': return stockGralA - stockGralB;
        case 'stock_general_desc': return stockGralB - stockGralA;
        
        // NUEVO: Ordenamiento por Stock Camión
        case 'stock_camion_asc': return stockCamionA - stockCamionB;
        case 'stock_camion_desc': return stockCamionB - stockCamionA;
        
        // NUEVO: Ordenamiento por Stock Almacén
        case 'stock_almacen_asc': return stockAlmacenA - stockAlmacenB;
        case 'stock_almacen_desc': return stockAlmacenB - stockAlmacenA;
        
        default: return 0;
      }
    });

    this.productosList = filtrados;
    this.total = this.productosList.length;
    this.totalPages = Math.ceil(this.total / this.limit) || 1;
    this.page = 1; 
    this.actualizarVistaPaginada();
  }
  /* aplicarFiltros() {
    let filtrados = [...this.productosOriginales];
    
    if (this.vistaActual === 'camion') {
        filtrados = filtrados.filter(p => (p.stock_camion || 0) > 0);
    } else if (this.vistaActual === 'almacen') {
        filtrados = filtrados.filter(p => ((p.stock || 0) - (p.stock_camion || 0)) > 0);
    }

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
    if (codProvFiltro !== '') filtrados = filtrados.filter(p => (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro));
    if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

    filtrados.sort((a, b) => {
      switch (this.filtros.orden) {
        case 'nombre_asc': return (a.nombre || '').localeCompare(b.nombre || '');
        case 'nombre_desc': return (b.nombre || '').localeCompare(a.nombre || '');
        case 'precio_asc': return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
        case 'precio_desc': return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        default: return 0;
      }
    });

    this.productosList = filtrados;
    this.total = this.productosList.length;
    this.totalPages = Math.ceil(this.total / this.limit) || 1;
    this.page = 1; 
    this.actualizarVistaPaginada();
  } */

  actualizarVistaPaginada() {
    const indiceInicio = (this.page - 1) * this.limit;
    const indiceFin = indiceInicio + this.limit;
    this.productosPaginados = this.productosList.slice(indiceInicio, indiceFin);
  }

  buscar() { this.aplicarFiltros(); }
  limpiar() { this.terminoBusqueda = ''; this.aplicarFiltros(); }
  limpiarFiltrosAvanzados() {
    this.filtros = { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
    this.aplicarFiltros();
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.page + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
      this.page = nuevaPagina;
      this.actualizarVistaPaginada();
    }
  }

  // --- LÓGICA DE MOVIMIENTO RÁPIDO Y VACIADO ---

  moverStock(producto: Producto, cantidadStr: string, destino: 'camion' | 'almacen') {
    const cantidad = parseInt(cantidadStr, 10);
    if (isNaN(cantidad) || cantidad <= 0) return;

    const stockTotal = producto.stock || 0;
    const stockCamionActual = producto.stock_camion || 0;
    const stockAlmacenActual = stockTotal - stockCamionActual;

    if (destino === 'camion' && stockAlmacenActual < cantidad) {
        this.notificationService.show('Stock en almacén insuficiente', 'error');
        return;
    }
    if (destino === 'almacen' && stockCamionActual < cantidad) {
        this.notificationService.show('Stock en camión insuficiente para devolver', 'error');
        return;
    }

    const nuevoStockCamion = destino === 'camion' 
        ? stockCamionActual + cantidad 
        : stockCamionActual - cantidad;

    const nuevoStockAlmacen = stockTotal - nuevoStockCamion;    

    // Actualizamos visualmente al instante
    producto.stock_camion = nuevoStockCamion;
    

    // Usamos el update general que ya existe en tu servicio
    this.productoService.actualizarStockRapido(producto.id!, nuevoStockAlmacen, nuevoStockCamion).subscribe({
      next: () => this.notificationService.show('Movimiento guardado', 'success'),
      error: () => {
        producto.stock_camion = stockCamionActual; // Revertir si falla
        this.notificationService.show('Error al sincronizar con el servidor', 'error');
        this.cd.detectChanges();
      }
    });
  }

  venderFeria(producto: Producto, cantidadStr: string) {
    const cantidad = parseInt(cantidadStr, 10);
    if (isNaN(cantidad) || cantidad <= 0) return;

    if ((producto.stock_camion || 0) < cantidad) {
        this.notificationService.show('No hay suficiente stock en el camión', 'error');
        return;
    }

    if (confirm(`¿Confirmar venta de feria: ${cantidad} x ${producto.nombre}?`)) {
        this.productoService.ventaFeriaRápida(producto.id!, cantidad).subscribe({
            next: () => {
                // Actualización local para no recargar toda la lista
                producto.stock_camion = (producto.stock_camion || 0) - cantidad;
                producto.stock = (producto.stock || 0) - cantidad;
                this.notificationService.show('Venta de feria registrada', 'success');
                this.cd.detectChanges();
            },
            error: () => this.notificationService.show('Error al registrar venta', 'error')
        });
    }
}

  vaciarCamion() {
    if (confirm('¿Estás seguro de que deseas vaciar el camión por completo? Todo el stock volverá al almacén.')) {
        this.loading = true;
        this.productoService.vaciarCamion().subscribe({
            next: () => {
                this.notificationService.show('Camión vaciado exitosamente', 'success');
                this.cargarProductos(); // Refrescamos todo desde cero
            },
            error: () => {
                this.loading = false;
                this.notificationService.show('Ocurrió un error al vaciar', 'error');
                this.cd.detectChanges();
            }
        });
    }
  }

  trackByProductoId(index: number, producto: Producto): number {
    return producto.id!;
  }
}

/* import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ProductoService, ProductoResponse } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-carga-camion',
  imports: [CommonModule, FormsModule],
  templateUrl: './carga-camion.html'
})
export class CargaCamionComponent implements OnInit {
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);
  
  loading = true;
  terminoBusqueda: string = '';
  
  // Lógica de Pestañas
  vistaActual: 'todos' | 'camion' | 'almacen' = 'todos';

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
    this.cargarProductos();
  }

  cargarProductos() {
    this.loading = true;
    // Traemos activos solamente
    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (resp: ProductoResponse) => {
        this.productosOriginales = resp.data;
        this.extraerListasDesplegables(); 
        this.aplicarFiltros(); 
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar', err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  extraerListasDesplegables() {
    const cats = this.productosOriginales.map(p => p.categoria || '').filter(c => c.trim() !== ''); 
    this.categoriasDisponibles = [...new Set(cats)].sort();
    const provs = this.productosOriginales.map(p => p.proveedor || '').filter(p => p.trim() !== ''); 
    this.proveedoresDisponibles = [...new Set(provs)].sort();
  }

  cambiarVistaTabs(vista: 'todos' | 'camion' | 'almacen') {
    this.vistaActual = vista;
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let filtrados = [...this.productosOriginales];
    
    // 1. Filtro de Pestañas (Logística)
    if (this.vistaActual === 'camion') {
        filtrados = filtrados.filter(p => (p.stock_camion || 0) > 0);
    } else if (this.vistaActual === 'almacen') {
        filtrados = filtrados.filter(p => (p.stock - (p.stock_camion || 0)) > 0);
    }

    // 2. Filtros Avanzados
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
    if (codProvFiltro !== '') filtrados = filtrados.filter(p => (p.codigo_proveedor || '').toLowerCase().includes(codProvFiltro));
    if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

    // 3. Ordenamiento
    filtrados.sort((a, b) => {
      switch (this.filtros.orden) {
        case 'nombre_asc': return (a.nombre || '').localeCompare(b.nombre || '');
        case 'nombre_desc': return (b.nombre || '').localeCompare(a.nombre || '');
        case 'precio_asc': return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
        case 'precio_desc': return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        default: return 0;
      }
    });

    this.productosList = filtrados;
    this.total = this.productosList.length;
    this.totalPages = Math.ceil(this.total / this.limit) || 1;
    this.page = 1; 
    this.actualizarVistaPaginada();
  }

  actualizarVistaPaginada() {
    const indiceInicio = (this.page - 1) * this.limit;
    const indiceFin = indiceInicio + this.limit;
    this.productosPaginados = this.productosList.slice(indiceInicio, indiceFin);
  }

  buscar() { this.aplicarFiltros(); }
  limpiar() { this.terminoBusqueda = ''; this.aplicarFiltros(); }
  limpiarFiltrosAvanzados() {
    this.filtros = { codigoProveedor: '', proveedorNombre: '', categoria: '', orden: 'nombre_asc' };
    this.aplicarFiltros();
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.page + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
      this.page = nuevaPagina;
      this.actualizarVistaPaginada();
    }
  }

  // LÓGICA MÁGICA DE CARGA EN CAMIÓN
  ajustarStockCamion(producto: Producto, cantidad: number) {
    const stockTotal = producto.stock || 0;
    const stockCamionActual = producto.stock_camion || 0;
    const nuevoStockCamion = stockCamionActual + cantidad;

    // Validaciones de seguridad
    if (nuevoStockCamion < 0 || nuevoStockCamion > stockTotal) return;

    // Actualización instantánea visual
    producto.stock_camion = nuevoStockCamion;

    // Petición silenciosa al backend
    this.productoService.update(producto.id!, { stock_camion: nuevoStockCamion }).subscribe({
      error: () => {
        // Si falla el servidor, revertimos
        producto.stock_camion = stockCamionActual;
        this.notificationService.show('Error al sincronizar con el servidor', 'error');
        this.cd.detectChanges();
      }
    });
  }

  trackByProductoId(index: number, producto: Producto): number {
    return producto.id!;
  }
} */