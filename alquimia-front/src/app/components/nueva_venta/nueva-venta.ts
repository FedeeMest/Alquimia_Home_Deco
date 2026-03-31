import { Component, ElementRef, ViewChild, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { VentaService, VentaRequest } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { ConfiguracionService } from '../../services/configuracion.service';
import { Producto } from '../../Interfaces/producto.interface';
import { Router } from '@angular/router';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

// 1. EXTENDEMOS LA INTERFAZ PARA INCLUIR EL INDEX DE BÚSQUEDA
interface ProductoIndexado extends Producto {
  _searchIndex: string;
}

interface ProductoCarrito extends Producto {
  cantidadCarrito: number;
  precioUnitarioAplicado: number;
  subtotal: number;
}

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './nueva-venta.html',
  styleUrl: './nueva-venta.css',
})
export class NuevaVentaComponent implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private ventaService = inject(VentaService);
  private notificationService = inject(NotificationService);
  private configuracionService = inject(ConfiguracionService);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  @ViewChild('scanInput') scanInput!: ElementRef;

  // Cambiamos el array a nuestra interfaz indexada
  productosCache: ProductoIndexado[] = [];
  productosEncontrados: ProductoIndexado[] = [];
  carrito: ProductoCarrito[] = [];
  
  busqueda: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  metodoPago: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA' = 'EFECTIVO';
  codigoLeido: string = '';
  
  recargoLocal: number = 0;   
  recargoTarjeta: number = 0; 
  descuentoEfectivo: number = 0;

  totalVenta: number = 0;
  totalArticulos: number = 0;
  guardando: boolean = false;
  cargandoProductos: boolean = true;

  mostrarCamara = false;
  formatosAdmitidos = [
    BarcodeFormat.EAN_13, 
    BarcodeFormat.EAN_8, 
    BarcodeFormat.CODE_128, 
    BarcodeFormat.QR_CODE
  ];

  ngOnInit() {
    this.cargarConfiguracion();
    this.cargarTodosLosProductos();

    // --- MOTOR DE BÚSQUEDA REACTIVO ---
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(250), // Bajamos un poco el tiempo para que se sienta más instantáneo
      distinctUntilChanged()
    ).subscribe(termino => {
      this.ejecutarBusquedaInteligente(termino);
    });
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  // --- HERRAMIENTA CENTRAL DE NORMALIZACIÓN ---
  private normalizarTexto(texto: string | undefined | null): string {
    if (!texto) return '';
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') 
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); 
  }

  cargarConfiguracion() {
    this.configuracionService.obtener().subscribe({
      next: (config) => {
        if (config) {
          this.recargoLocal = config.porcentaje_local || 0; 
          this.recargoTarjeta = config.porcentaje_tarjeta || 0;
          this.descuentoEfectivo = config.porcentaje_efectivo || 0;
        }
      },
      error: (err) => console.error('Error cargando configuración', err)
    });
  }

  cargarTodosLosProductos() {
    this.cargandoProductos = true;
    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (resp) => {
        // PRE-INDEXACIÓN (Enterprise Standard): 
        // Creamos una "super cadena" limpia una sola vez al cargar la página
        this.productosCache = resp.data.map(p => ({
          ...p,
          _searchIndex: this.normalizarTexto(`${p.nombre} ${p.codigo_barra} ${p.codigo_proveedor} ${p.categoria}`)
        }));
        
        this.cargandoProductos = false;
        this.cd.detectChanges();
        setTimeout(() => this.enfocarScanner(), 100);
      },
      error: (err) => {
        console.error('Error cargando productos:', err);
        this.cargandoProductos = false;
        this.notificationService.show('Error al cargar la lista de productos', 'error');
        this.cd.detectChanges();
      }
    });
  }

  // Se dispara cada vez que el usuario teclea algo
  buscar(termino: string) {
    this.busqueda = termino; 
    if (termino.trim().length < 2) {
      this.productosEncontrados = [];
      return;
    }
    this.searchSubject.next(termino);
  }

  // --- LÓGICA CORE DE BÚSQUEDA EMPRESARIAL ---
  private ejecutarBusquedaInteligente(termino: string) {
    const terminoSaneado = this.normalizarTexto(termino);
    const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

    if (palabrasBuscadas.length === 0) {
      this.productosEncontrados = [];
      this.cd.detectChanges();
      return;
    }

    // 1. FILTRADO SÚPER RÁPIDO (O(N) usando la cadena pre-indexada)
    let resultados = this.productosCache.filter(p => 
      palabrasBuscadas.every(palabra => p._searchIndex.includes(palabra))
    );

    // 2. SISTEMA DE RELEVANCIA (Scoring)
    // El primer término tipeado es el más importante para el usuario
    const terminoPrincipal = palabrasBuscadas[0];

    resultados.sort((a, b) => {
      const nombreA = this.normalizarTexto(a.nombre);
      const nombreB = this.normalizarTexto(b.nombre);

      // Prioridad 1: Match exacto del código de barras (Si tipeó el código con teclado)
      if (a.codigo_barra === terminoSaneado) return -1;
      if (b.codigo_barra === terminoSaneado) return 1;

      // Prioridad 2: El nombre EMPIEZA con la primera palabra que escribieron
      const aEmpieza = nombreA.startsWith(terminoPrincipal) ? 1 : 0;
      const bEmpieza = nombreB.startsWith(terminoPrincipal) ? 1 : 0;
      
      if (aEmpieza !== bEmpieza) {
        return bEmpieza - aEmpieza; // El que empieza con la palabra sube en la lista
      }

      // Prioridad 3: Si ambos tienen la palabra, priorizamos el nombre más corto 
      // (Ej: "Taza" le gana a "Taza de cerámica importada grande")
      return nombreA.length - nombreB.length;
    });

    // Para evitar saturar el DOM en el frontend si hay muchas coincidencias, limitamos a los top 30 mejores resultados
    this.productosEncontrados = resultados.slice(0, 30);
    this.cd.detectChanges();
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.productosEncontrados = [];
    this.enfocarScanner();
  }

  agregarProductoManual(producto: Producto) {
    this.agregarAlCarrito(producto);
    this.limpiarBusqueda();
  }

  enfocarScanner() {
    if (this.scanInput) {
      this.scanInput.nativeElement.focus();
    }
  }

  onScannerEnter() {
    const codigoLimpio = (this.codigoLeido || '').trim();
    if (!codigoLimpio) return;

    // Aquí también aprovechamos el _searchIndex para el escáner rápido si se tipea el código de proveedor
    const productoEncontrado = this.productosCache.find(p => 
      (p.codigo_barra || '').trim() === codigoLimpio ||
      (p.codigo_proveedor || '').trim().toLowerCase() === codigoLimpio.toLowerCase()
    );

    if (productoEncontrado) {
      this.agregarAlCarrito(productoEncontrado);
    } else {
      this.notificationService.show(`No se encontró producto con código: ${codigoLimpio}`, 'error');
    }

    this.codigoLeido = '';
    this.enfocarScanner();
  }

  toggleCamara() {
    this.mostrarCamara = !this.mostrarCamara;
    if (!this.mostrarCamara) {
      setTimeout(() => this.enfocarScanner(), 100);
    }
  }

  onCodigoEscaneadoCamara(codigo: string) {
    this.codigoLeido = codigo;
    this.mostrarCamara = false; 
    this.onScannerEnter(); 
  }

  agregarAlCarrito(producto: Producto) {
    const itemExistente = this.carrito.find(item => item.id === producto.id);
    
    if (itemExistente) {
      itemExistente.cantidadCarrito += 1;
    } else {
      const nuevoItem: ProductoCarrito = {
        ...producto,
        cantidadCarrito: 1,
        precioUnitarioAplicado: 0, 
        subtotal: 0
      };
      this.carrito.unshift(nuevoItem);
    }
    
    this.calcularTotales();
    this.notificationService.show('Producto agregado al ticket', 'success');
  }

  modificarCantidad(index: number, delta: number) {
    const item = this.carrito[index];
    const nuevaCantidad = item.cantidadCarrito + delta;
    
    if (nuevaCantidad > 0) {
      item.cantidadCarrito = nuevaCantidad;
      this.calcularTotales();
    }
  }

  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    this.calcularTotales();
  }

  cambiarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA') {
    this.metodoPago = metodo;
    this.calcularTotales();
  }

  calcularTotales() {
    this.totalVenta = 0;
    this.totalArticulos = 0;

    this.carrito.forEach(item => {
      let precioAplicado = item.precio_efectivo || 0;

      if (this.metodoPago === 'TARJETA_LOCAL') {
        precioAplicado = item.precio_tarjeta_local || 0;
      } else if (this.metodoPago === 'TARJETA') {
        precioAplicado = item.precio_tarjeta || 0;
      }

      item.precioUnitarioAplicado = precioAplicado;
      item.subtotal = precioAplicado * item.cantidadCarrito;

      this.totalVenta += item.subtotal;
      this.totalArticulos += item.cantidadCarrito;
    });
  }

  cancelarVenta() {
    if (this.carrito.length > 0) {
      if (confirm('¿Estás seguro de cancelar esta venta? Se perderán todos los artículos del ticket.')) {
        this.carrito = [];
        this.calcularTotales();
        this.limpiarBusqueda();
      }
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  completarVenta() {
    if (this.carrito.length === 0) {
      this.notificationService.show('Agrega al menos un producto al carrito para vender', 'error');
      return;
    }

    if (confirm('¿Confirmar el cierre de esta venta?')) {
      this.guardando = true;

      const payload: VentaRequest = {
        total: this.totalVenta,
        metodo_pago: this.metodoPago,
        detalles: this.carrito.map(item => ({
          producto_id: item.id!,
          cantidad: item.cantidadCarrito,
          precio_unitario: item.precioUnitarioAplicado,
          subtotal: item.subtotal
        }))
      };

      this.ventaService.crear(payload).pipe(
        finalize(() => {
          this.guardando = false;
          this.cd.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.notificationService.show('¡Venta completada con éxito!', 'success');
          this.carrito = [];
          this.calcularTotales();
          this.limpiarBusqueda();
        },
        error: (err) => {
          console.error('Error al guardar la venta:', err);
          this.notificationService.show('Error al registrar la venta en la base de datos', 'error');
        }
      });
    }
  }
}

/* import { Component, ElementRef, ViewChild, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { VentaService, VentaRequest } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { ConfiguracionService } from '../../services/configuracion.service';
import { Producto } from '../../Interfaces/producto.interface';
import { Router } from '@angular/router';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

interface ProductoCarrito extends Producto {
  cantidadCarrito: number;
  precioUnitarioAplicado: number;
  subtotal: number;
}

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './nueva-venta.html',
  styleUrl: './nueva-venta.css',
})
export class NuevaVentaComponent implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private ventaService = inject(VentaService);
  private notificationService = inject(NotificationService);
  private configuracionService = inject(ConfiguracionService);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  @ViewChild('scanInput') scanInput!: ElementRef;

  productosCache: Producto[] = [];
  productosEncontrados: Producto[] = [];
  carrito: ProductoCarrito[] = [];
  
  busqueda: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  metodoPago: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA_EXTERNA' = 'EFECTIVO';
  codigoLeido: string = '';
  
  recargoLocal: number = 0;   
  recargoTarjeta: number = 0; 
  descuentoEfectivo: number = 0;

  totalVenta: number = 0;
  totalArticulos: number = 0;
  guardando: boolean = false;
  cargandoProductos: boolean = true;

  // --- LÓGICA DE ESCÁNER DE CÁMARA ---
  mostrarCamara = false;
  formatosAdmitidos = [
    BarcodeFormat.EAN_13, 
    BarcodeFormat.EAN_8, 
    BarcodeFormat.CODE_128, 
    BarcodeFormat.QR_CODE
  ];

  ngOnInit() {
    this.cargarConfiguracion();
    this.cargarTodosLosProductos();

    // --- AQUÍ ESTÁ LA NUEVA BÚSQUEDA INTELIGENTE TOKENIZADA ---
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(termino => {
      // 1. Saneamos y tokenizamos lo que llegó del subject
      const terminoSaneado = this.normalizarTexto(termino);
      const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

      // Si borró todo, limpiamos la lista
      if (palabrasBuscadas.length === 0) {
        this.productosEncontrados = [];
        return;
      }

      // 2. Filtramos la caché de forma inteligente
      this.productosEncontrados = this.productosCache.filter(p => {
        const nombreDB = this.normalizarTexto(p.nombre);
        const codBarraDB = this.normalizarTexto(p.codigo_barra);
        const codProvDB = this.normalizarTexto(p.codigo_proveedor);

        // 3. Exigimos que TODAS las palabras tipeadas estén (sin importar el orden)
        return palabrasBuscadas.every(palabra => 
          nombreDB.includes(palabra) || 
          codBarraDB.includes(palabra) ||
          codProvDB.includes(palabra)
        );
      });
      
      this.cd.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  // --- FUNCIÓN NORMALIZADORA (EL CEREBRO DEL BUSCADOR) ---
  private normalizarTexto(texto: string | undefined | null): string {
    if (!texto) return '';
    return texto
      .normalize('NFD') // Separa acentos
      .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Elimina múltiples espacios seguidos
  }

  cargarConfiguracion() {
    this.configuracionService.obtener().subscribe({
      next: (config) => {
        if (config) {
          this.recargoLocal = config.porcentaje_local || 0; 
          this.recargoTarjeta = config.porcentaje_tarjeta || 0;
          this.descuentoEfectivo = config.porcentaje_efectivo || 0;
        }
      },
      error: (err) => console.error('Error cargando configuración', err)
    });
  }

  cargarTodosLosProductos() {
    this.cargandoProductos = true;
    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (resp) => {
        this.productosCache = resp.data;
        this.cargandoProductos = false;
        this.cd.detectChanges();
        setTimeout(() => this.enfocarScanner(), 100);
      },
      error: (err) => {
        console.error('Error cargando productos:', err);
        this.cargandoProductos = false;
        this.notificationService.show('Error al cargar la lista de productos', 'error');
        this.cd.detectChanges();
      }
    });
  }

  buscar(termino: string) {
    this.busqueda = termino; 
    if (termino.trim().length < 2) {
      this.productosEncontrados = [];
      return;
    }
    this.searchSubject.next(termino);
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.productosEncontrados = [];
    this.enfocarScanner();
  }

  agregarProductoManual(producto: Producto) {
    this.agregarAlCarrito(producto);
    this.limpiarBusqueda();
  }

  enfocarScanner() {
    if (this.scanInput) {
      this.scanInput.nativeElement.focus();
    }
  }

  // Lógica del escáner láser físico
  onScannerEnter() {
    const codigoLimpio = (this.codigoLeido || '').trim();
    if (!codigoLimpio) return;

    const productoEncontrado = this.productosCache.find(p => 
      (p.codigo_barra || '').trim() === codigoLimpio ||
      (p.codigo_proveedor || '').trim().toLowerCase() === codigoLimpio.toLowerCase()
    );

    if (productoEncontrado) {
      this.agregarAlCarrito(productoEncontrado);
    } else {
      this.notificationService.show(`No se encontró producto con código: ${codigoLimpio}`, 'error');
    }

    this.codigoLeido = '';
    this.enfocarScanner();
  }

  // Lógica del escáner de cámara
  toggleCamara() {
    this.mostrarCamara = !this.mostrarCamara;
    if (!this.mostrarCamara) {
      setTimeout(() => this.enfocarScanner(), 100);
    }
  }

  onCodigoEscaneadoCamara(codigo: string) {
    this.codigoLeido = codigo;
    this.mostrarCamara = false; 
    this.onScannerEnter(); 
  }

  agregarAlCarrito(producto: Producto) {
    const itemExistente = this.carrito.find(item => item.id === producto.id);
    
    if (itemExistente) {
      itemExistente.cantidadCarrito += 1;
    } else {
      const nuevoItem: ProductoCarrito = {
        ...producto,
        cantidadCarrito: 1,
        precioUnitarioAplicado: 0, 
        subtotal: 0
      };
      this.carrito.unshift(nuevoItem);
    }
    
    this.calcularTotales();
    this.notificationService.show('Producto agregado al ticket', 'success');
  }

  modificarCantidad(index: number, delta: number) {
    const item = this.carrito[index];
    const nuevaCantidad = item.cantidadCarrito + delta;
    
    if (nuevaCantidad > 0) {
      item.cantidadCarrito = nuevaCantidad;
      this.calcularTotales();
    }
  }

  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    this.calcularTotales();
  }

  cambiarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA_EXTERNA') {
    this.metodoPago = metodo;
    this.calcularTotales();
  }

  calcularTotales() {
    this.totalVenta = 0;
    this.totalArticulos = 0;

    this.carrito.forEach(item => {
      let precioAplicado = item.precio_efectivo || 0;

      if (this.metodoPago === 'TARJETA_LOCAL') {
        precioAplicado = item.precio_tarjeta_local || 0;
      } else if (this.metodoPago === 'TARJETA_EXTERNA') {
        precioAplicado = item.precio_tarjeta || 0;
      }

      item.precioUnitarioAplicado = precioAplicado;
      item.subtotal = precioAplicado * item.cantidadCarrito;

      this.totalVenta += item.subtotal;
      this.totalArticulos += item.cantidadCarrito;
    });
  }

  cancelarVenta() {
    if (this.carrito.length > 0) {
      if (confirm('¿Estás seguro de cancelar esta venta? Se perderán todos los artículos del ticket.')) {
        this.carrito = [];
        this.calcularTotales();
        this.limpiarBusqueda();
      }
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  completarVenta() {
    if (this.carrito.length === 0) {
      this.notificationService.show('Agrega al menos un producto al carrito para vender', 'error');
      return;
    }

    if (confirm('¿Confirmar el cierre de esta venta?')) {
      this.guardando = true;

      const payload: VentaRequest = {
        total: this.totalVenta,
        metodo_pago: this.metodoPago,
        detalles: this.carrito.map(item => ({
          producto_id: item.id!,
          cantidad: item.cantidadCarrito,
          precio_unitario: item.precioUnitarioAplicado,
          subtotal: item.subtotal
        }))
      };

      this.ventaService.create(payload).pipe(
        finalize(() => {
          this.guardando = false;
          this.cd.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.notificationService.show('¡Venta completada con éxito!', 'success');
          this.carrito = [];
          this.calcularTotales();
          this.limpiarBusqueda();
          // Opcional: Redirigir al historial de ventas o imprimir comprobante
          // this.router.navigate(['/ventas']); 
        },
        error: (err) => {
          console.error('Error al guardar la venta:', err);
          this.notificationService.show('Error al registrar la venta en la base de datos', 'error');
        }
      });
    }
  }
} */

// /* import { Component, ElementRef, ViewChild, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { ProductoService } from '../../services/producto.service';
// import { VentaService, VentaRequest } from '../../services/venta.service';
// import { NotificationService } from '../../services/notification.service';
// import { Producto } from '../../Interfaces/producto.interface';
// import { Router } from '@angular/router';
// import { ZXingScannerModule } from '@zxing/ngx-scanner';
// import { BarcodeFormat } from '@zxing/library';
// import { Subject, Subscription } from 'rxjs';
// import { debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';

// // Interfaz local para mostrar en la tabla del carrito
// interface ItemCarrito {
//   producto: Producto;
//   cantidad: number;
//   subtotal: number;
// }

// @Component({
//   selector: 'app-nueva-venta',
//   standalone: true,
//   imports: [CommonModule, FormsModule, ZXingScannerModule],
//   templateUrl: './nueva-venta.html',
// })
// export class NuevaVentaComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private ventaService = inject(VentaService);
//   private notificationService = inject(NotificationService);
//   private router = inject(Router);
//   private cdr = inject(ChangeDetectorRef);
//   private searchSubject = new Subject<string>();
//   private searchSubscription?: Subscription;

//   @ViewChild('inputBusqueda') inputBusqueda!: ElementRef;

//   // Estado
//   busqueda = '';
//   productosEncontrados: Producto[] = [];
//   carrito: ItemCarrito[] = [];
//   metodoPago: 'EFECTIVO' | 'TARJETA' | 'TARJETA_LOCAL' = 'EFECTIVO';
//   estadoVenta: 'COBRADA' | 'PENDIENTE' = 'COBRADA';
//   total = 0;
//   autoEnter = true;
//   procesando = false;
//   datosCliente = {
//     nombre: '',
//     cuit: '',
//     direccion: ''
//   };
//   datosVenta = {
//     vendedor: 'Admin', // Podrías sacarlo del login si tuvieras
//     cuotas: 1
//   };

//   observaciones = '';

//   mostrarCamara = false;
//   dispositivoActual: MediaDeviceInfo | undefined; // La cámara seleccionada
//   tienePermisos = false;
//   formatosAdmitidos = [
//     BarcodeFormat.EAN_13, 
//     BarcodeFormat.EAN_8, 
//     BarcodeFormat.CODE_128, 
//     BarcodeFormat.QR_CODE
//   ];

//   mostrarSugerencias = false;

//   ngOnInit() {
//     // 1. Foco inicial al campo de búsqueda
//     setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);

//     // 2. Configuración del "Tubo" de búsqueda reactiva
//     this.searchSubscription = this.searchSubject.pipe(
//       debounceTime(300),        // Espera 300ms desde que dejas de escribir
//       distinctUntilChanged(),   // Si el texto es igual al anterior, no hace nada
//       switchMap((terminoCrudo) => {
//         // Limpiamos espacios al principio y final
//         const termino = terminoCrudo.trim(); 
        
//         // Validación de longitud mínima
//         if (termino.length < 2) {
//           // Retornamos un array vacío (como observable) si es muy corto
//           return []; 
//         }

//         // Llamada al Backend
//         return this.productoService.getAll(termino).pipe(
//           // Procesamos la respuesta AQUÍ para ordenarla antes de mostrarla
//           map((resp: any) => {
//             const lista = resp.data || [];
            
//             // LOGICA DE ORDENAMIENTO: Exactos primero
//             return lista.sort((a: Producto, b: Producto) => {
//               const busqueda = termino.toLowerCase();
//               const codigoA = String(a.codigo_barra).trim().toLowerCase();
//               const codigoB = String(b.codigo_barra).trim().toLowerCase();

//               // Si A es el código exacto, va primero (-1)
//               if (codigoA === busqueda) return -1;
//               // Si B es el código exacto, va primero (1, empuja a A abajo)
//               if (codigoB === busqueda) return 1;
              
//               return 0; // Si ninguno es exacto, mantiene el orden original del backend
//             });
//           })
//         );
//       })
//     ).subscribe({
//       next: (productosOrdenados: Producto[]) => {
//         // Actualizamos la lista visible
//         this.productosEncontrados = productosOrdenados;
//         this.cdr.detectChanges(); // Forzamos la detección de cambios por si acaso

//         // OPCIONAL: Auto-seleccionar si hay 1 solo resultado y es EXACTO
//         /*
//         if (this.autoEnter && this.productosEncontrados.length === 1) {
//             const p = this.productosEncontrados[0];
//             if (String(p.codigo_barra).trim() === this.busqueda.trim()) {
//                 this.agregarAlCarrito(p);
//             }
//         }
//         */
//       },
//       error: (err) => {
//         console.error('Error en el buscador:', err);
//         this.procesando = false;
//       }
//     });
//   }

//   ngOnDestroy() {
//     // Importante desuscribirse para evitar fugas de memoria
//     this.searchSubscription?.unsubscribe();
//   }
//   onInputFocus() {
//   this.mostrarSugerencias = true;
// }

// onInputBlur() {
//   // Usamos un timeout para dar tiempo a que el "click" en la lista 
//   // se registre antes de ocultarla. Sin esto, la lista desaparece 
//   // antes de que el evento (click) se dispare.
//   setTimeout(() => {
//     this.mostrarSugerencias = false;
//   }, 200);
// }

//   toggleCamara() {
//     this.mostrarCamara = !this.mostrarCamara;
//     // Si cerramos cámara, volvemos el foco al input
//     if (!this.mostrarCamara) {
//       setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
//     }
//   }

//   onCamerasFound(devices: MediaDeviceInfo[]): void {
//     this.tienePermisos = true;
    
//     // 1. Buscamos la cámara trasera (environment)
//     // En iOS, la cámara principal suele etiquetarse como "Back Camera" o "Cámara trasera"
//     // Evitamos las que digan "Ultra Wide" si es posible, ya que no enfocan de cerca.
    
//     let camaraSeleccionada = devices.find(device => 
//       /back|trasera/i.test(device.label) && 
//       !/wide|angular/i.test(device.label) // Tratamos de evitar el gran angular si hay otra opción
//     );

//     // 2. Si no encontramos una "ideal", buscamos cualquiera trasera
//     if (!camaraSeleccionada) {
//        camaraSeleccionada = devices.find(device => /back|trasera/i.test(device.label));
//     }

//     // 3. Si aún así no hay, usamos la primera que encuentre (fallback)
//     this.dispositivoActual = camaraSeleccionada || devices[0];
//   }

//   onCodigoEscaneado(codigo: string) {
//     const codigoLimpio = codigo.trim(); // Limpiamos espacios vacíos por si acaso
//     this.busqueda = codigoLimpio;
//     this.mostrarCamara = false; // Cerramos la cámara
//     this.cdr.detectChanges();
    
//     // Buscamos el producto
//     this.productoService.getAll(codigoLimpio).subscribe((resp: any) => {
//       this.productosEncontrados = resp.data;
//         if (this.autoEnter && this.productosEncontrados.length > 0) {
//             const exacto = this.productosEncontrados.find(p => String(p.codigo_barra).trim() === String(codigoLimpio).trim());
//             if (exacto) {
//                 this.agregarAlCarrito(exacto);
//             } else {
//                 this.agregarAlCarrito(this.productosEncontrados[0]);
//             }
//             this.busqueda = ''; 
//             this.productosEncontrados = [];
//         }
//         this.cdr.detectChanges();
//         setTimeout(() => {
//             if(this.inputBusqueda) this.inputBusqueda.nativeElement.focus();
//         }, 200);
//     });
//   }

//   // --- MOTOR DE BÚSQUEDA INTELIGENTE ---
  
//   // Función para sanitizar textos: quita tildes, dobles espacios y pasa a minúsculas
//   private normalizarTexto(texto: string | undefined | null): string {
//     if (!texto) return '';
//     return texto
//       .normalize('NFD') // Separa las letras de sus acentos
//       .replace(/[\u0300-\u036f]/g, '') // Elimina los acentos
//       .toLowerCase()
//       .trim()
//       .replace(/\s+/g, ' '); // Reemplaza múltiples espacios seguidos por uno solo
//   }

//   // 1. Buscar productos mientras escribes
//   buscar(termino: string) {
//     // 1. Actualizamos manualmente la variable local para mantener sincronía
//     this.busqueda = termino; 

//     // 2. Usamos el valor que llega del evento, no la variable this.busqueda
//     // Evitamos el trim() aquí para que distinctUntilChanged detecte cambios como "espacios" si fuera necesario,
//     // el trim() lo haremos dentro del pipe antes de llamar a la API.
    
//     if (termino.trim().length < 2) {
//       this.productosEncontrados = [];
//       // Si quieres limpiar cuando borran, puedes emitir vacío o no hacer nada
//       return;
//     }

//     this.searchSubject.next(termino);
//   }

//   // 2. Agregar al carrito
//   agregarAlCarrito(producto: Producto) {
//     // Verificar si ya existe para sumar cantidad
//     const existe = this.carrito.find(item => item.producto.id === producto.id);

//     if (existe) {
//       if (existe.cantidad + 1 > producto.stock) {
//         this.notificationService.show('No hay suficiente stock', 'error');
//         return;
//       }
//       existe.cantidad++;
//     } else {
//       if (producto.stock < 1) {
//         this.notificationService.show('Producto sin stock', 'error');
//         return;
//       }
//       this.carrito.push({ producto, cantidad: 1, subtotal: 0 });
//     }

//     this.calcularTotales();
//     this.busqueda = '';
//     this.productosEncontrados = []; // Limpiar lista de búsqueda
//     this.inputBusqueda.nativeElement.focus(); // Volver al input
//   }

//   // 3. Quitar del carrito
//   quitarDelCarrito(index: number) {
//     this.carrito.splice(index, 1);
//     this.calcularTotales();
//   }

//   // 4. Calcular Totales Dinámicos
//   calcularTotales() {
//     this.total = 0;
//     this.carrito.forEach(item => {
//       // Elegir precio según método de pago
//       let precio = 0;
//       if (this.metodoPago === 'EFECTIVO') {
//         precio = item.producto.precio_efectivo || 0;
//       } else if (this.metodoPago === 'TARJETA') {
//         precio = item.producto.precio_tarjeta || 0; // 15%
//       } else {
//         precio = item.producto.precio_tarjeta_local || 0; // 6%
//       }

//       item.subtotal = precio * item.cantidad;
//       this.total += item.subtotal;
//     });
//   }

//   // 5. Finalizar Venta
//   // 5. Finalizar Venta
//   confirmarVenta() {
//     if (this.carrito.length === 0) return;

//     this.procesando = true;

//     // Armamos el objeto completo
//     const ventaPayload: VentaRequest = {
//       // 1. Datos básicos
//       metodo_pago: this.metodoPago,
//       items: this.carrito.map(item => ({
//         id_producto: item.producto.id!,
//         cantidad: item.cantidad
//       })),
//       estado: this.estadoVenta,

//       // 2. Datos del Cliente
//       cliente_nombre: this.datosCliente.nombre,
//       cliente_cuit: this.datosCliente.cuit,
//       cliente_direccion: this.datosCliente.direccion,

//       // 3. Datos de la Venta
//       usuario_vendedor: this.datosVenta.vendedor,
      
//       // 4. Financieros
//       cuotas: (this.metodoPago !== 'EFECTIVO') ? this.datosVenta.cuotas : 1,
//       observaciones: this.observaciones
//     };

//     this.ventaService.crear(ventaPayload).subscribe({
//       next: (response: any) => { // <--- CAMBIO: Recibimos 'response'
//         this.notificationService.show(`Venta registrada con éxito`, 'success');
        
//         // Como nos vamos de la página, ya no hace falta limpiarTodo(), 
//         // pero redirigimos usando el ID que nos devolvió el backend.
//         const idVenta = response.id; 
//         this.router.navigate(['/ventas', idVenta]); 
//       },
//       error: (err) => {
//         console.error(err);
//         // Ajuste para leer el mensaje de error correctamente si viene del backend
//         const mensajeError = err.error?.message || 'Error al procesar venta';
//         this.notificationService.show(mensajeError, 'error');
//         this.procesando = false;
//       }
//     });
//   }

//   limpiarTodo() {
//     this.carrito = [];
//     this.total = 0;
//     this.busqueda = '';
//     this.procesando = false;
//     this.datosCliente = { nombre: 'Consumidor Final', cuit: '', direccion: '' };
//     this.datosVenta.cuotas = 1;
//     this.metodoPago = 'EFECTIVO'; // Volver al default
//     this.estadoVenta = 'COBRADA';
//     this.observaciones = '';

//     setTimeout(() => this.inputBusqueda.nativeElement.focus(), 100);
//   }
// } */