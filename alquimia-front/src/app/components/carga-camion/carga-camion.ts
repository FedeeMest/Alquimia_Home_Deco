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

  // Función para sanitizar textos: quita tildes, dobles espacios y pasa a minúsculas
  private normalizarTexto(texto: string | undefined | null): string {
    if (!texto) return '';
    return texto
      .normalize('NFD') // Separa las letras de sus acentos
      .replace(/[\u0300-\u036f]/g, '') // Elimina los acentos
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Reemplaza múltiples espacios por uno solo
  }

  generarPdfCarga() {
    // 1. Filtramos automáticamente solo lo que tiene stock en el camión
    const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

    if (enCamion.length === 0) {
        this.notificationService.show('No hay productos cargados en el camión para generar el listado.', 'error');
        return;
    }

    this.notificationService.show('Generando listado de feria...', 'info');

    // 2. AGRUPACIÓN POR CATEGORÍA
    const productosPorCategoria: { [categoria: string]: Producto[] } = {};
    let totalUnidades = 0;   
    
    enCamion.forEach(prod => {
      const cat = prod.categoria || 'Sin Categoría';
      if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
      productosPorCategoria[cat].push(prod);

      totalUnidades += (prod.stock_camion || 0);
    });

    const categoriasOrdenadas = Object.keys(productosPorCategoria).sort();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 3. Encabezado Estilo Alquimia
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text('Listado de Mercadería - Feria', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Alquimia Home Deco  |  Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

    // 4. Resumen de Carga superior
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Items: ${enCamion.length} refs  |  Total Unidades en Transporte: ${totalUnidades}`, 14, 36);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 40, pageWidth - 14, 40);

    let startY = 48;

    // 5. DIBUJADO DE TABLAS POR CATEGORÍA
    categoriasOrdenadas.forEach((categoria) => {
      if (startY + 45 > pageHeight) { 
        doc.addPage();
        startY = 20;
      }

      // Título de la Categoría
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // Slate-800
      doc.text(categoria.toUpperCase(), 14, startY);
      startY += 6;

      const productosDeLaCategoria = productosPorCategoria[categoria];
      // Ordenamos alfabéticamente dentro de la categoría
      productosDeLaCategoria.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

      // Mapeo de columnas: Código, Producto, Proveedor, Cantidad, Precio
      const datosTabla = productosDeLaCategoria.map(p => [
        p.codigo_barra || '-',
        p.nombre || '-',
        p.proveedor || '-',
        p.stock_camion?.toString() || '0',
        `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['Código', 'Producto', 'Proveedor', 'Cant.', 'Precio Venta']],
        body: datosTabla,
        theme: 'striped', // Tema igual a producto-list
        headStyles: { 
          fillColor: [15, 23, 42], 
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
        
        columnStyles: {
          0: { cellWidth: 25, halign: 'center' }, // Código centrado
          1: { cellWidth: 'auto' }, // Producto toma lo sobrante
          2: { cellWidth: 35 }, // Proveedor
          3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Cantidad centrada
          4: { cellWidth: 25, halign: 'center', fontStyle: 'bold', fontSize: 10, textColor: [5, 150, 105] } // Precio grande y centrado
        },
        
        margin: { bottom: 25 }, 
        rowPageBreak: 'avoid',  
        showHead: 'everyPage'   
      });

      startY = (doc as any).lastAutoTable.finalY + 12; 
    });

    // 6. Pie de página con numeración
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184); 
      
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
      doc.text(
        `Página ${i} de ${pageCount}  -  Uso Feria - Alquimia Home Deco`, 
        pageWidth / 2, 
        pageHeight - 8, 
        { align: 'center' }
      );
    }

    doc.save(`Listado_Feria_${new Date().toISOString().split('T')[0]}.pdf`);
    this.notificationService.show('PDF de Feria generado con éxito', 'success');
  }

  /* generarPdfCarga() {
    // 1. Filtramos automáticamente solo lo que tiene stock en el camión
    const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

    if (enCamion.length === 0) {
        this.notificationService.show('No hay productos cargados en el camión para generar el listado.', 'error');
        return;
    }

    this.notificationService.show('Generando listado de feria...', 'info');

    // 2. Ordenamos por nombre para que el cliente encuentre todo rápido
    enCamion.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 3. Encabezado Estilo Alquimia
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text('Listado de Mercadería - Feria', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Alquimia Home Deco  |  Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

    // 4. Resumen de Carga
    const totalUnidades = enCamion.reduce((acc, p) => acc + (p.stock_camion || 0), 0);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Items: ${enCamion.length}  |  Total Unidades en Transporte: ${totalUnidades}`, 14, 36);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 40, pageWidth - 14, 40);

    // 5. Mapeo de datos (Agregamos la columna de Precio Efectivo)
    const datos = enCamion.map(p => [
        p.codigo_barra || '-',
        p.nombre || '-',
        p.stock_camion?.toString() || '0',
        `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`, // PRECIO UNITARIO
        '' // Espacio para control manual
    ]);

    // 6. Generación de la Tabla
    autoTable(doc, {
        startY: 45,
        head: [['Código', 'Producto', 'Cant.', 'Precio Venta', 'Control Check']],
        body: datos,
        theme: 'grid', 
        headStyles: { 
            fillColor: [15, 23, 42], // Slate oscuro
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 30, fontStyle: 'normal', halign:'center'},
            1: { cellWidth: 'auto' },
            2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            3: { 
                cellWidth: 40, 
                halign: 'center', 
                fontStyle: 'bold',
                fontSize: 13, 
                textColor: [5, 150, 105] // Verde Esmeralda (igual que en el catálogo)
            },
            4: { 
                cellWidth: 30, 
                halign: 'center' } 
        },
        styles: { fontSize: 9, cellPadding: 4, textColor: [51, 65, 83] }, 
        alternateRowStyles: { fillColor: [248, 250, 252] }, 
        
        didDrawPage: function (data) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(148, 163, 184); 
            doc.text(
                `Página ${data.pageNumber}  -  Alquimia Home Deco - Uso Feria`, 
                pageWidth / 2, 
                pageHeight - 10, 
                { align: 'center' }
            );
        }
    });

    doc.save(`Listado_Feria_${new Date().toISOString().split('T')[0]}.pdf`);
    this.notificationService.show('PDF de Feria generado con éxito', 'success');
  } */

  

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
    
    // Filtro por pestañas (Camión / Almacén)
    if (this.vistaActual === 'camion') {
        filtrados = filtrados.filter(p => (p.stock_camion || 0) > 0);
    } else if (this.vistaActual === 'almacen') {
        filtrados = filtrados.filter(p => ((p.stock || 0) - (p.stock_camion || 0)) > 0);
    }

    // 1. PREPARAMOS EL TÉRMINO DE BÚSQUEDA (Saneado y Tokenizado)
    const terminoSaneado = this.normalizarTexto(this.terminoBusqueda);
    const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

    const codProvFiltro = this.normalizarTexto(this.filtros.codigoProveedor);
    const provNombreFiltro = this.filtros.proveedorNombre;
    const catFiltro = this.filtros.categoria;

    // 2. BÚSQUEDA INTELIGENTE
    if (palabrasBuscadas.length > 0) {
      filtrados = filtrados.filter(p => {
        const nombreDB = this.normalizarTexto(p.nombre);
        const codBarraDB = this.normalizarTexto(p.codigo_barra);
        const codProvDB = this.normalizarTexto(p.codigo_proveedor);

        // Todas las palabras tipeadas deben existir en el producto (sin importar el orden)
        return palabrasBuscadas.every(palabra => 
          nombreDB.includes(palabra) || 
          codBarraDB.includes(palabra) || 
          codProvDB.includes(palabra)
        );
      });
    }

    // 3. FILTROS AVANZADOS
    if (codProvFiltro !== '') {
      filtrados = filtrados.filter(p => 
        this.normalizarTexto(p.codigo_proveedor).includes(codProvFiltro)
      );
    }
    if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

    // 4. LÓGICA DE ORDENAMIENTO (Mantenemos tu configuración actual)
    filtrados.sort((a, b) => {
      const stockGralA = a.stock || 0;
      const stockGralB = b.stock || 0;
      const stockCamionA = a.stock_camion || 0;
      const stockCamionB = b.stock_camion || 0;
      const stockAlmacenA = stockGralA - stockCamionA;
      const stockAlmacenB = stockGralB - stockCamionB;

      switch (this.filtros.orden) {
        case 'nombre_asc': return (a.nombre || '').localeCompare(b.nombre || '');
        case 'nombre_desc': return (b.nombre || '').localeCompare(a.nombre || '');
        case 'precio_asc': return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
        case 'precio_desc': return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        
        case 'stock_general_asc': return stockGralA - stockGralB;
        case 'stock_general_desc': return stockGralB - stockGralA;
        
        case 'stock_camion_asc': return stockCamionA - stockCamionB;
        case 'stock_camion_desc': return stockCamionB - stockCamionA;
        
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

