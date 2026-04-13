import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ProductoService, ProductoResponse } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { ClienteService } from '../../services/cliente.service'; // NUEVO
import { VentaService } from '../../services/venta.service';     // NUEVO
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-carga-camion',
  imports: [CommonModule, FormsModule],
  templateUrl: './carga-camion.html'
})
export class CargaCamionComponent implements OnInit {
  private productoService = inject(ProductoService);
  private clienteService = inject(ClienteService); // Inyectamos ClienteService
  private ventaService = inject(VentaService);     // Inyectamos VentaService
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

  cantidadesIngresadas: { [key: number]: number } = {};

  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 0;

  // --- VARIABLES PARA EL MODAL DE CLIENTES (Venta Rápida) ---
  mostrarModalClientes: boolean = false;
  clientesTotales: any[] = [];
  clientesModalFiltrados: any[] = [];
  busquedaModal: string = '';
  
  // Guardamos temporalmente qué producto y qué cantidad se quiere vender
  productoTempParaVenta: Producto | null = null;
  cantidadTempParaVenta: number = 0;
  // ----------------------------------------------------------

  get conteoFiltrosActivos(): number {
    let count = 0;
    if (this.filtros.codigoProveedor.trim() !== '') count++;
    if (this.filtros.proveedorNombre !== '') count++;
    if (this.filtros.categoria !== '') count++;
    return count;
  }

  ngOnInit(): void {
    this.cargarProductos();
    this.cargarClientes(); // Cargamos los clientes al inicio
  }

  // Carga la lista de clientes para el modal
  cargarClientes() {
    this.clienteService.getClientes().subscribe({
      next: (res: any) => {
        this.clientesTotales = res.data;
        this.clientesModalFiltrados = this.clientesTotales;
      },
      error: (err) => console.error('Error cargando clientes', err)
    });
  }

  private normalizarTexto(texto: string | undefined | null): string {
    if (!texto) return '';
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); 
  }

  generarPdfCarga() {
    const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

    if (enCamion.length === 0) {
        this.notificationService.show('No hay productos cargados en el camión para generar el listado.', 'error');
        return;
    }

    this.notificationService.show('Generando listado de feria...', 'info');

    // 1. Usamos nuestra nueva función agrupadora
    const reporteAgrupado = this.agruparProductosParaPDF(enCamion);
    const categoriasOrdenadas = Object.keys(reporteAgrupado).sort();

    let totalUnidades = 0;   
    enCamion.forEach(prod => totalUnidades += (prod.stock_camion || 0));

    // 2. Configuración base del PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text('Listado de Mercadería - Feria', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); 
    doc.text(`Alquimia Home Deco  |  Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Items: ${enCamion.length} refs  |  Total Unidades en Transporte: ${totalUnidades}`, 14, 36);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 40, pageWidth - 14, 40);

    let startY = 48;

    // 3. DIBUJAR LAS TABLAS
    categoriasOrdenadas.forEach((categoria) => {
      const datosCategoria = reporteAgrupado[categoria];

      if (startY + 30 > pageHeight) { 
        doc.addPage();
        startY = 20;
      }

      // Título de la Categoría Principal (Ej: MANTELES)
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); 
      doc.text(categoria.toUpperCase(), 14, startY);
      startY += 6;

      // === CASO A: MANTELES (Tienen subcategorías por medida) ===
      if (datosCategoria.esSubcategorizada) {
          const medidas = Object.keys(datosCategoria.subcategorias).sort();
          
          medidas.forEach(medida => {
              if (startY + 20 > pageHeight) { doc.addPage(); startY = 20; }

              // Subtítulo de la medida (Ej: Medida: 3x1.40)
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bolditalic');
              doc.setTextColor(71, 85, 105);
              doc.text(`Medida: ${medida}`, 18, startY); // Un poco más adentro (indentado)
              startY += 4;

              const productosDeLaMedida = datosCategoria.subcategorias[medida];
              productosDeLaMedida.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));

              const datosTabla = productosDeLaMedida.map((p: any) => [
                p.codigo_barra || '-', p.nombre || '-', p.proveedor || '-',
                p.stock_camion?.toString() || '0', `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
              ]);

              autoTable(doc, {
                startY: startY,
                head: [['Código', 'Producto', 'Proveedor', 'Cant.', 'Precio Venta']],
                body: datosTabla,
                theme: 'striped', 
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
                styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
                columnStyles: {
                  0: { cellWidth: 25, halign: 'center' }, 
                  1: { cellWidth: 'auto' }, 
                  2: { cellWidth: 35 }, 
                  3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 
                  4: { cellWidth: 25, halign: 'center', fontStyle: 'bold', fontSize: 10, textColor: [5, 150, 105] } 
                },
                margin: { left: 18, right: 14, bottom: 25 }, // Indentamos la tabla de manteles
                rowPageBreak: 'avoid',  
                showHead: 'firstPage'   
              });

              startY = (doc as any).lastAutoTable.finalY + 8; 
          });
          startY += 4; // Espacio extra antes de la siguiente categoría

      } 
      // === CASO B: PRODUCTOS NORMALES (Ej: Espejos, Velas) ===
      else {
          const productosGenerales = datosCategoria.itemsGenerales;
          productosGenerales.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));

          const datosTabla = productosGenerales.map((p: any) => [
            p.codigo_barra || '-', p.nombre || '-', p.proveedor || '-',
            p.stock_camion?.toString() || '0', `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
          ]);

          autoTable(doc, {
            startY: startY,
            head: [['Código', 'Producto', 'Proveedor', 'Cant.', 'Precio Venta']],
            body: datosTabla,
            theme: 'striped', 
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
            columnStyles: {
              0: { cellWidth: 25, halign: 'center' }, 
              1: { cellWidth: 'auto' }, 
              2: { cellWidth: 35 }, 
              3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 
              4: { cellWidth: 25, halign: 'center', fontStyle: 'bold', fontSize: 10, textColor: [5, 150, 105] } 
            },
            margin: { bottom: 25 }, 
            rowPageBreak: 'avoid',  
            showHead: 'everyPage'   
          });

          startY = (doc as any).lastAutoTable.finalY + 12; 
      }
    });

    // 4. Pie de página con numeración
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
  // generarPdfCarga() {
  //   const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

  //   if (enCamion.length === 0) {
  //       this.notificationService.show('No hay productos cargados en el camión para generar el listado.', 'error');
  //       return;
  //   }

  //   this.notificationService.show('Generando listado de feria...', 'info');

  //   const productosPorCategoria: { [categoria: string]: Producto[] } = {};
  //   let totalUnidades = 0;   
    
  //   enCamion.forEach(prod => {
  //     const cat = prod.categoria || 'Sin Categoría';
  //     if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
  //     productosPorCategoria[cat].push(prod);

  //     totalUnidades += (prod.stock_camion || 0);
  //   });

  //   const categoriasOrdenadas = Object.keys(productosPorCategoria).sort();

  //   const doc = new jsPDF();
  //   const pageWidth = doc.internal.pageSize.getWidth();
  //   const pageHeight = doc.internal.pageSize.getHeight();

  //   doc.setFontSize(22);
  //   doc.setTextColor(15, 23, 42); 
  //   doc.text('Listado de Mercadería - Feria', 14, 20);

  //   doc.setFontSize(10);
  //   doc.setTextColor(100, 116, 139); 
  //   doc.text(`Alquimia Home Deco  |  Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

  //   doc.setFontSize(11);
  //   doc.setTextColor(15, 23, 42);
  //   doc.setFont('helvetica', 'bold');
  //   doc.text(`Items: ${enCamion.length} refs  |  Total Unidades en Transporte: ${totalUnidades}`, 14, 36);

  //   doc.setDrawColor(226, 232, 240);
  //   doc.setLineWidth(0.5);
  //   doc.line(14, 40, pageWidth - 14, 40);

  //   let startY = 48;

  //   categoriasOrdenadas.forEach((categoria) => {
  //     if (startY + 45 > pageHeight) { 
  //       doc.addPage();
  //       startY = 20;
  //     }

  //     doc.setFontSize(13);
  //     doc.setFont('helvetica', 'bold');
  //     doc.setTextColor(30, 41, 59); 
  //     doc.text(categoria.toUpperCase(), 14, startY);
  //     startY += 6;

  //     const productosDeLaCategoria = productosPorCategoria[categoria];
  //     productosDeLaCategoria.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  //     const datosTabla = productosDeLaCategoria.map(p => [
  //       p.codigo_barra || '-',
  //       p.nombre || '-',
  //       p.proveedor || '-',
  //       p.stock_camion?.toString() || '0',
  //       `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
  //     ]);

  //     autoTable(doc, {
  //       startY: startY,
  //       head: [['Código', 'Producto', 'Proveedor', 'Cant.', 'Precio Venta']],
  //       body: datosTabla,
  //       theme: 'striped', 
  //       headStyles: { 
  //         fillColor: [15, 23, 42], 
  //         textColor: [255, 255, 255],
  //         fontStyle: 'bold',
  //         halign: 'center'
  //       },
  //       styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
        
  //       columnStyles: {
  //         0: { cellWidth: 25, halign: 'center' }, 
  //         1: { cellWidth: 'auto' }, 
  //         2: { cellWidth: 35 }, 
  //         3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 
  //         4: { cellWidth: 25, halign: 'center', fontStyle: 'bold', fontSize: 10, textColor: [5, 150, 105] } 
  //       },
        
  //       margin: { bottom: 25 }, 
  //       rowPageBreak: 'avoid',  
  //       showHead: 'everyPage'   
  //     });

  //     startY = (doc as any).lastAutoTable.finalY + 12; 
  //   });

  //   const pageCount = (doc as any).internal.getNumberOfPages();
  //   for (let i = 1; i <= pageCount; i++) {
  //     doc.setPage(i);
  //     doc.setFontSize(8);
  //     doc.setFont('helvetica', 'italic');
  //     doc.setTextColor(148, 163, 184); 
      
  //     doc.setDrawColor(226, 232, 240);
  //     doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
  //     doc.text(
  //       `Página ${i} de ${pageCount}  -  Uso Feria - Alquimia Home Deco`, 
  //       pageWidth / 2, 
  //       pageHeight - 8, 
  //       { align: 'center' }
  //     );
  //   }

  //   doc.save(`Listado_Feria_${new Date().toISOString().split('T')[0]}.pdf`);
  //   this.notificationService.show('PDF de Feria generado con éxito', 'success');
  // }

  private agruparProductosParaPDF(productos: Producto[]) {
    // Regex para detectar "2x2", "2.5x1.50", "2 x 1,5", etc.
    const regexMedida = /(\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?)/i;
    const reporteAgrupado: Record<string, any> = {};

    productos.forEach(prod => {
      const categoria = prod.categoria || 'Sin Categoría';

      if (!reporteAgrupado[categoria]) {
        reporteAgrupado[categoria] = {
          esSubcategorizada: false,
          itemsGenerales: [],
          subcategorias: {}
        };
      }

      // Si es categoría Manteles, extraemos la medida
      if (categoria.toLowerCase().includes('mantel')) {
        reporteAgrupado[categoria].esSubcategorizada = true;
        
        const coincidencia = (prod.nombre || '').match(regexMedida);
        const medidaDetectada = coincidencia 
            ? coincidencia[1].replace(/\s+/g, '').toLowerCase() // Normaliza: "3 x 1.4" -> "3x1.4"
            : 'Otras Medidas / Lisos';

        if (!reporteAgrupado[categoria].subcategorias[medidaDetectada]) {
          reporteAgrupado[categoria].subcategorias[medidaDetectada] = [];
        }
        reporteAgrupado[categoria].subcategorias[medidaDetectada].push(prod);

      } else {
        // Resto de los productos normales
        reporteAgrupado[categoria].itemsGenerales.push(prod);
      }
    });

    return reporteAgrupado;
  }

  llenarTransporteMasivo() {
    const productosAMover = this.productosOriginales.filter(p => 
        this.cantidadesIngresadas[p.id!] && this.cantidadesIngresadas[p.id!] > 0
    );

    if (productosAMover.length === 0) {
        this.notificationService.show('No ingresaste ninguna cantidad para mover.', 'info');
        return;
    }

    if (confirm(`¿Estás seguro de mover ${productosAMover.length} productos distintos al camión?`)) {
        this.loading = true;
        const peticiones: any[] = [];

        productosAMover.forEach(producto => {
            const cantidadAMover = this.cantidadesIngresadas[producto.id!];
            const stockTotal = producto.stock || 0;
            const stockCamionActual = producto.stock_camion || 0;
            const stockAlmacenActual = stockTotal - stockCamionActual;

            if (stockAlmacenActual >= cantidadAMover) {
                const nuevoStockCamion = stockCamionActual + cantidadAMover;
                const nuevoStockAlmacen = stockTotal - nuevoStockCamion;

                producto.stock_camion = nuevoStockCamion;
                peticiones.push(this.productoService.actualizarStockRapido(producto.id!, nuevoStockAlmacen, nuevoStockCamion));
            }
        });

        const omitidos = productosAMover.length - peticiones.length;
        if (omitidos > 0) {
            this.notificationService.show(`Se omitieron ${omitidos} productos por falta de stock en almacén.`, 'error');
        }

        if (peticiones.length === 0) {
            this.loading = false;
            return; 
        }

        forkJoin(peticiones).subscribe({
            next: () => {
                this.notificationService.show('¡Carga masiva completada con éxito!', 'success');
                this.cantidadesIngresadas = {}; 
                this.loading = false;
                this.cd.detectChanges();
            },
            error: () => {
                this.notificationService.show('Hubo un error al guardar algunos productos.', 'error');
                this.cargarProductos(); 
            }
        });
    }
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

    const terminoSaneado = this.normalizarTexto(this.terminoBusqueda);
    const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

    const codProvFiltro = this.normalizarTexto(this.filtros.codigoProveedor);
    const provNombreFiltro = this.filtros.proveedorNombre;
    const catFiltro = this.filtros.categoria;

    if (palabrasBuscadas.length > 0) {
      filtrados = filtrados.filter(p => {
        const nombreDB = this.normalizarTexto(p.nombre);
        const codBarraDB = this.normalizarTexto(p.codigo_barra);
        const codProvDB = this.normalizarTexto(p.codigo_proveedor);

        return palabrasBuscadas.every(palabra => 
          nombreDB.includes(palabra) || 
          codBarraDB.includes(palabra) || 
          codProvDB.includes(palabra)
        );
      });
    }

    if (codProvFiltro !== '') {
      filtrados = filtrados.filter(p => 
        this.normalizarTexto(p.codigo_proveedor).includes(codProvFiltro)
      );
    }
    if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
    if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

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

  moverStock(producto: Producto, cantidadStr: string, destino: 'camion' | 'almacen') {
    const cantidad = parseInt(cantidadStr || '0', 10);
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

    producto.stock_camion = nuevoStockCamion;
    
    this.productoService.actualizarStockRapido(producto.id!, nuevoStockAlmacen, nuevoStockCamion).subscribe({
      next: () => this.notificationService.show('Movimiento guardado', 'success'),
      error: () => {
        producto.stock_camion = stockCamionActual; 
        this.notificationService.show('Error al sincronizar con el servidor', 'error');
        this.cd.detectChanges();
      }
    });
  }


  // =========================================================================
  // LÓGICA DEL POPUP DE VENTAS 
  // =========================================================================
  
  // 1. En lugar de vender directo, abrimos el modal
  abrirModalVenta(producto: Producto, cantidadStr: string) {
    const cantidad = parseInt(cantidadStr || '0', 10);
    if (isNaN(cantidad) || cantidad <= 0) return;

    if ((producto.stock_camion || 0) < cantidad) {
        this.notificationService.show('No hay suficiente stock en el camión para vender esa cantidad', 'error');
        return;
    }

    // Guardamos los datos temporalmente
    this.productoTempParaVenta = producto;
    this.cantidadTempParaVenta = cantidad;

    // Abrimos el modal reseteando la búsqueda
    this.busquedaModal = '';
    this.clientesModalFiltrados = this.clientesTotales;
    this.mostrarModalClientes = true;
  }

  cerrarModalClientes() {
    this.mostrarModalClientes = false;
    this.productoTempParaVenta = null;
    this.cantidadTempParaVenta = 0;
  }

  filtrarClientesModal() {
    const term = this.normalizarTexto(this.busquedaModal);
    if (!term) {
        this.clientesModalFiltrados = this.clientesTotales;
        return;
    }
    this.clientesModalFiltrados = this.clientesTotales.filter(c => this.normalizarTexto(c.nombre).includes(term));
  }

  // 2. Al seleccionar el cliente, ejecutamos la venta con la API oficial
  ejecutarVentaSeleccionada(clienteId: number | null, clienteNombre: string) {
    if (!this.productoTempParaVenta || this.cantidadTempParaVenta <= 0) {
      this.cerrarModalClientes();
      return;
    }

    if (confirm(`¿Confirmar la venta de ${this.cantidadTempParaVenta}x ${this.productoTempParaVenta.nombre} a ${clienteNombre}?`)) {
        
        this.loading = true;

        // Construimos el Payload oficial de ventas (como en nueva-venta)
        const payload = {
          metodo_pago: 'EFECTIVO', // Por defecto en venta rápida
          estado: 'COBRADA',
          observaciones: 'Venta rápida individual desde camión',
          cliente_id: clienteId || undefined, 
          items: [{
              id_producto: this.productoTempParaVenta.id!,
              cantidad: this.cantidadTempParaVenta
          }]
        };

        // Llamamos a VentaService.crear en vez del método viejo
        this.ventaService.crear(payload as any).subscribe({
            next: () => {
                // Actualizamos la vista local sin recargar todo
                if (this.productoTempParaVenta) {
                  this.productoTempParaVenta.stock_camion = (this.productoTempParaVenta.stock_camion || 0) - this.cantidadTempParaVenta;
                  this.productoTempParaVenta.stock = (this.productoTempParaVenta.stock || 0) - this.cantidadTempParaVenta;
                }
                
                this.notificationService.show('¡Venta de feria registrada con éxito!', 'success');
                this.cerrarModalClientes();
                this.loading = false;
                this.cd.detectChanges();
            },
            error: (err) => {
              console.error(err);
              this.notificationService.show('Error al registrar la venta', 'error');
              this.cerrarModalClientes();
              this.loading = false;
            }
        });
    }
  }
  // =========================================================================

  vaciarCamion() {
    if (confirm('¿Estás seguro de que deseas vaciar el camión por completo? Todo el stock volverá al almacén.')) {
        this.loading = true;
        this.productoService.vaciarCamion().subscribe({
            next: () => {
                this.notificationService.show('Camión vaciado exitosamente', 'success');
                this.cargarProductos(); 
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
// import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common'; 
// import { ProductoService, ProductoResponse } from '../../services/producto.service';
// import { Producto } from '../../Interfaces/producto.interface';
// import { FormsModule } from '@angular/forms';
// import { NotificationService } from '../../services/notification.service';
// import { jsPDF } from 'jspdf';
// import autoTable from 'jspdf-autotable';
// import { forkJoin } from 'rxjs';

// @Component({
//   selector: 'app-carga-camion',
//   imports: [CommonModule, FormsModule],
//   templateUrl: './carga-camion.html'
// })
// export class CargaCamionComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private notificationService = inject(NotificationService);
//   private cd = inject(ChangeDetectorRef);
  
//   loading = true;
//   terminoBusqueda: string = '';
  
//   vistaActual: 'todos' | 'camion' | 'almacen' = 'todos';
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

//   cantidadesIngresadas: { [key: number]: number } = {};

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
//     this.cargarProductos();
//   }

//   // Función para sanitizar textos: quita tildes, dobles espacios y pasa a minúsculas
//   private normalizarTexto(texto: string | undefined | null): string {
//     if (!texto) return '';
//     return texto
//       .normalize('NFD') // Separa las letras de sus acentos
//       .replace(/[\u0300-\u036f]/g, '') // Elimina los acentos
//       .toLowerCase()
//       .trim()
//       .replace(/\s+/g, ' '); // Reemplaza múltiples espacios por uno solo
//   }

//   generarPdfCarga() {
//     // 1. Filtramos automáticamente solo lo que tiene stock en el camión
//     const enCamion = this.productosOriginales.filter(p => (p.stock_camion || 0) > 0);

//     if (enCamion.length === 0) {
//         this.notificationService.show('No hay productos cargados en el camión para generar el listado.', 'error');
//         return;
//     }

//     this.notificationService.show('Generando listado de feria...', 'info');

//     // 2. AGRUPACIÓN POR CATEGORÍA
//     const productosPorCategoria: { [categoria: string]: Producto[] } = {};
//     let totalUnidades = 0;   
    
//     enCamion.forEach(prod => {
//       const cat = prod.categoria || 'Sin Categoría';
//       if (!productosPorCategoria[cat]) productosPorCategoria[cat] = [];
//       productosPorCategoria[cat].push(prod);

//       totalUnidades += (prod.stock_camion || 0);
//     });

//     const categoriasOrdenadas = Object.keys(productosPorCategoria).sort();

//     const doc = new jsPDF();
//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();

//     // 3. Encabezado Estilo Alquimia
//     doc.setFontSize(22);
//     doc.setTextColor(15, 23, 42); // Slate-900
//     doc.text('Listado de Mercadería - Feria', 14, 20);

//     doc.setFontSize(10);
//     doc.setTextColor(100, 116, 139); // Slate-500
//     doc.text(`Alquimia Home Deco  |  Fecha: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

//     // 4. Resumen de Carga superior
//     doc.setFontSize(11);
//     doc.setTextColor(15, 23, 42);
//     doc.setFont('helvetica', 'bold');
//     doc.text(`Items: ${enCamion.length} refs  |  Total Unidades en Transporte: ${totalUnidades}`, 14, 36);

//     doc.setDrawColor(226, 232, 240);
//     doc.setLineWidth(0.5);
//     doc.line(14, 40, pageWidth - 14, 40);

//     let startY = 48;

//     // 5. DIBUJADO DE TABLAS POR CATEGORÍA
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
//       // Ordenamos alfabéticamente dentro de la categoría
//       productosDeLaCategoria.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

//       // Mapeo de columnas: Código, Producto, Proveedor, Cantidad, Precio
//       const datosTabla = productosDeLaCategoria.map(p => [
//         p.codigo_barra || '-',
//         p.nombre || '-',
//         p.proveedor || '-',
//         p.stock_camion?.toString() || '0',
//         `$ ${p.precio_efectivo?.toLocaleString('es-AR') || '0'}`
//       ]);

//       autoTable(doc, {
//         startY: startY,
//         head: [['Código', 'Producto', 'Proveedor', 'Cant.', 'Precio Venta']],
//         body: datosTabla,
//         theme: 'striped', // Tema igual a producto-list
//         headStyles: { 
//           fillColor: [15, 23, 42], 
//           textColor: [255, 255, 255],
//           fontStyle: 'bold',
//           halign: 'center'
//         },
//         styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 83] }, 
        
//         columnStyles: {
//           0: { cellWidth: 25, halign: 'center' }, // Código centrado
//           1: { cellWidth: 'auto' }, // Producto toma lo sobrante
//           2: { cellWidth: 35 }, // Proveedor
//           3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Cantidad centrada
//           4: { cellWidth: 25, halign: 'center', fontStyle: 'bold', fontSize: 10, textColor: [5, 150, 105] } // Precio grande y centrado
//         },
        
//         margin: { bottom: 25 }, 
//         rowPageBreak: 'avoid',  
//         showHead: 'everyPage'   
//       });

//       startY = (doc as any).lastAutoTable.finalY + 12; 
//     });

//     // 6. Pie de página con numeración
//     const pageCount = (doc as any).internal.getNumberOfPages();
//     for (let i = 1; i <= pageCount; i++) {
//       doc.setPage(i);
//       doc.setFontSize(8);
//       doc.setFont('helvetica', 'italic');
//       doc.setTextColor(148, 163, 184); 
      
//       doc.setDrawColor(226, 232, 240);
//       doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
      
//       doc.text(
//         `Página ${i} de ${pageCount}  -  Uso Feria - Alquimia Home Deco`, 
//         pageWidth / 2, 
//         pageHeight - 8, 
//         { align: 'center' }
//       );
//     }

//     doc.save(`Listado_Feria_${new Date().toISOString().split('T')[0]}.pdf`);
//     this.notificationService.show('PDF de Feria generado con éxito', 'success');
//   }

//   llenarTransporteMasivo() {
//     // Filtramos los productos que tienen una cantidad mayor a 0 en el input
//     const productosAMover = this.productosOriginales.filter(p => 
//         this.cantidadesIngresadas[p.id!] && this.cantidadesIngresadas[p.id!] > 0
//     );

//     if (productosAMover.length === 0) {
//         this.notificationService.show('No ingresaste ninguna cantidad para mover.', 'info');
//         return;
//     }

//     if (confirm(`¿Estás seguro de mover ${productosAMover.length} productos distintos al camión?`)) {
//         this.loading = true;
//         const peticiones: any[] = [];

//         productosAMover.forEach(producto => {
//             const cantidadAMover = this.cantidadesIngresadas[producto.id!];
//             const stockTotal = producto.stock || 0;
//             const stockCamionActual = producto.stock_camion || 0;
//             const stockAlmacenActual = stockTotal - stockCamionActual;

//             // Validamos que haya stock suficiente en el almacén
//             if (stockAlmacenActual >= cantidadAMover) {
//                 const nuevoStockCamion = stockCamionActual + cantidadAMover;
//                 const nuevoStockAlmacen = stockTotal - nuevoStockCamion;

//                 // Actualización instantánea en la vista
//                 producto.stock_camion = nuevoStockCamion;

//                 // Preparamos la petición al backend
//                 peticiones.push(this.productoService.actualizarStockRapido(producto.id!, nuevoStockAlmacen, nuevoStockCamion));
//             }
//         });

//         // Verificamos si algunos productos se omitieron por falta de stock
//         const omitidos = productosAMover.length - peticiones.length;
//         if (omitidos > 0) {
//             this.notificationService.show(`Se omitieron ${omitidos} productos por falta de stock en almacén.`, 'error');
//         }

//         if (peticiones.length === 0) {
//             this.loading = false;
//             return; // No ejecutamos el forkJoin si no hay peticiones válidas
//         }

//         // Ejecutamos todas las peticiones al mismo tiempo
//         forkJoin(peticiones).subscribe({
//             next: () => {
//                 this.notificationService.show('¡Carga masiva completada con éxito!', 'success');
//                 this.cantidadesIngresadas = {}; // Limpiamos todos los inputs
//                 this.loading = false;
//                 this.cd.detectChanges();
//             },
//             error: () => {
//                 this.notificationService.show('Hubo un error al guardar algunos productos.', 'error');
//                 this.cargarProductos(); // Recargamos para evitar datos erróneos en la pantalla
//             }
//         });
//     }
//   }

//   cargarProductos() {
//     this.loading = true;
//     this.productoService.getAll('', true, 1, 10000).subscribe({
//       next: (resp: ProductoResponse) => {
//         this.productosOriginales = resp.data;
//         this.extraerListasDesplegables(); 
//         this.aplicarFiltros(); 
//         this.loading = false;
//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error('Error al cargar', err);
//         this.loading = false;
//         this.cd.detectChanges();
//       }
//     });
//   }

//   extraerListasDesplegables() {
//     const cats = this.productosOriginales.map(p => p.categoria || '').filter(c => c.trim() !== ''); 
//     this.categoriasDisponibles = [...new Set(cats)].sort();
//     const provs = this.productosOriginales.map(p => p.proveedor || '').filter(p => p.trim() !== ''); 
//     this.proveedoresDisponibles = [...new Set(provs)].sort();
//   }

//   cambiarVistaTabs(vista: 'todos' | 'camion' | 'almacen') {
//     this.vistaActual = vista;
//     this.aplicarFiltros();
//   }
  
//   aplicarFiltros() {
//     let filtrados = [...this.productosOriginales];
    
//     // Filtro por pestañas (Camión / Almacén)
//     if (this.vistaActual === 'camion') {
//         filtrados = filtrados.filter(p => (p.stock_camion || 0) > 0);
//     } else if (this.vistaActual === 'almacen') {
//         filtrados = filtrados.filter(p => ((p.stock || 0) - (p.stock_camion || 0)) > 0);
//     }

//     // 1. PREPARAMOS EL TÉRMINO DE BÚSQUEDA (Saneado y Tokenizado)
//     const terminoSaneado = this.normalizarTexto(this.terminoBusqueda);
//     const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

//     const codProvFiltro = this.normalizarTexto(this.filtros.codigoProveedor);
//     const provNombreFiltro = this.filtros.proveedorNombre;
//     const catFiltro = this.filtros.categoria;

//     // 2. BÚSQUEDA INTELIGENTE
//     if (palabrasBuscadas.length > 0) {
//       filtrados = filtrados.filter(p => {
//         const nombreDB = this.normalizarTexto(p.nombre);
//         const codBarraDB = this.normalizarTexto(p.codigo_barra);
//         const codProvDB = this.normalizarTexto(p.codigo_proveedor);

//         // Todas las palabras tipeadas deben existir en el producto (sin importar el orden)
//         return palabrasBuscadas.every(palabra => 
//           nombreDB.includes(palabra) || 
//           codBarraDB.includes(palabra) || 
//           codProvDB.includes(palabra)
//         );
//       });
//     }

//     // 3. FILTROS AVANZADOS
//     if (codProvFiltro !== '') {
//       filtrados = filtrados.filter(p => 
//         this.normalizarTexto(p.codigo_proveedor).includes(codProvFiltro)
//       );
//     }
//     if (provNombreFiltro !== '') filtrados = filtrados.filter(p => p.proveedor === provNombreFiltro);
//     if (catFiltro !== '') filtrados = filtrados.filter(p => p.categoria === catFiltro);

//     // 4. LÓGICA DE ORDENAMIENTO (Mantenemos tu configuración actual)
//     filtrados.sort((a, b) => {
//       const stockGralA = a.stock || 0;
//       const stockGralB = b.stock || 0;
//       const stockCamionA = a.stock_camion || 0;
//       const stockCamionB = b.stock_camion || 0;
//       const stockAlmacenA = stockGralA - stockCamionA;
//       const stockAlmacenB = stockGralB - stockCamionB;

//       switch (this.filtros.orden) {
//         case 'nombre_asc': return (a.nombre || '').localeCompare(b.nombre || '');
//         case 'nombre_desc': return (b.nombre || '').localeCompare(a.nombre || '');
//         case 'precio_asc': return (a.precio_efectivo || 0) - (b.precio_efectivo || 0);
//         case 'precio_desc': return (b.precio_efectivo || 0) - (a.precio_efectivo || 0);
        
//         case 'stock_general_asc': return stockGralA - stockGralB;
//         case 'stock_general_desc': return stockGralB - stockGralA;
        
//         case 'stock_camion_asc': return stockCamionA - stockCamionB;
//         case 'stock_camion_desc': return stockCamionB - stockCamionA;
        
//         case 'stock_almacen_asc': return stockAlmacenA - stockAlmacenB;
//         case 'stock_almacen_desc': return stockAlmacenB - stockAlmacenA;
        
//         default: return 0;
//       }
//     });

//     this.productosList = filtrados;
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

//   buscar() { this.aplicarFiltros(); }
//   limpiar() { this.terminoBusqueda = ''; this.aplicarFiltros(); }
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

//   // --- LÓGICA DE MOVIMIENTO RÁPIDO Y VACIADO ---

//   moverStock(producto: Producto, cantidadStr: string, destino: 'camion' | 'almacen') {
//     const cantidad = parseInt(cantidadStr || '0', 10);
//     if (isNaN(cantidad) || cantidad <= 0) return;

//     const stockTotal = producto.stock || 0;
//     const stockCamionActual = producto.stock_camion || 0;
//     const stockAlmacenActual = stockTotal - stockCamionActual;

//     if (destino === 'camion' && stockAlmacenActual < cantidad) {
//         this.notificationService.show('Stock en almacén insuficiente', 'error');
//         return;
//     }
//     if (destino === 'almacen' && stockCamionActual < cantidad) {
//         this.notificationService.show('Stock en camión insuficiente para devolver', 'error');
//         return;
//     }

//     const nuevoStockCamion = destino === 'camion' 
//         ? stockCamionActual + cantidad 
//         : stockCamionActual - cantidad;

//     const nuevoStockAlmacen = stockTotal - nuevoStockCamion;    

//     // Actualizamos visualmente al instante
//     producto.stock_camion = nuevoStockCamion;
    

//     // Usamos el update general que ya existe en tu servicio
//     this.productoService.actualizarStockRapido(producto.id!, nuevoStockAlmacen, nuevoStockCamion).subscribe({
//       next: () => this.notificationService.show('Movimiento guardado', 'success'),
//       error: () => {
//         producto.stock_camion = stockCamionActual; // Revertir si falla
//         this.notificationService.show('Error al sincronizar con el servidor', 'error');
//         this.cd.detectChanges();
//       }
//     });
//   }

//   venderFeria(producto: Producto, cantidadStr: string) {
//     const cantidad = parseInt(cantidadStr || '0', 10);
//     if (isNaN(cantidad) || cantidad <= 0) return;

//     if ((producto.stock_camion || 0) < cantidad) {
//         this.notificationService.show('No hay suficiente stock en el camión', 'error');
//         return;
//     }

//     if (confirm(`¿Confirmar venta de feria: ${cantidad} x ${producto.nombre}?`)) {
//         this.productoService.ventaFeriaRápida(producto.id!, cantidad).subscribe({
//             next: () => {
//                 // Actualización local para no recargar toda la lista
//                 producto.stock_camion = (producto.stock_camion || 0) - cantidad;
//                 producto.stock = (producto.stock || 0) - cantidad;
//                 this.notificationService.show('Venta de feria registrada', 'success');
//                 this.cd.detectChanges();
//             },
//             error: () => this.notificationService.show('Error al registrar venta', 'error')
//         });
//     }
// }

//   vaciarCamion() {
//     if (confirm('¿Estás seguro de que deseas vaciar el camión por completo? Todo el stock volverá al almacén.')) {
//         this.loading = true;
//         this.productoService.vaciarCamion().subscribe({
//             next: () => {
//                 this.notificationService.show('Camión vaciado exitosamente', 'success');
//                 this.cargarProductos(); // Refrescamos todo desde cero
//             },
//             error: () => {
//                 this.loading = false;
//                 this.notificationService.show('Ocurrió un error al vaciar', 'error');
//                 this.cd.detectChanges();
//             }
//         });
//     }
//   }

//   trackByProductoId(index: number, producto: Producto): number {
//     return producto.id!;
//   }
// }

