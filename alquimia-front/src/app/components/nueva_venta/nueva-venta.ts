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
import { ClienteService } from '../../services/cliente.service';

interface ProductoIndexado extends Producto {
  _searchIndex: string;
}

interface ProductoCarrito {
  producto: ProductoIndexado | Producto;
  cantidad: number;
  precioUnitarioAplicado: number;
  subtotal: number;
}

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './nueva-venta.html'
})
export class NuevaVentaComponent implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private ventaService = inject(VentaService);
  private notificationService = inject(NotificationService);
  private configuracionService = inject(ConfiguracionService);
  private clienteService = inject(ClienteService);
  private router = inject(Router);
  private cd = inject(ChangeDetectorRef);

  @ViewChild('scanInput') scanInput!: ElementRef;

  dispositivoActual: any;
  mostrarSugerencias: boolean = false;
  autoEnter: boolean = false;
  estadoVenta: 'PENDIENTE' | 'COBRADA' | string = 'PENDIENTE';
  observaciones: string = '';
  total: number = 0; 

  clientesDisponibles: any[] = [];
  clienteSeleccionadoId: number | null = null;

  mostrarModalCliente = false;
  nuevoClienteForm = { nombre: '', telefono: '', tipo: 'Feria' };
  creandoCliente = false;

  datosVenta = {
    cuotas: 1
  };

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
  procesando: boolean = false;
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
    this.cargarClientes();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(250),
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

  cargarClientes() {
    this.clienteService.getClientes().subscribe({
      next: (res: any) => {
        this.clientesDisponibles = res.data;
      },
      error: (err) => console.error('Error cargando clientes:', err)
    });
  }

  abrirModalCliente() {
    this.mostrarModalCliente = true;
  }

  cerrarModalCliente() {
    this.mostrarModalCliente = false;
    this.nuevoClienteForm = { nombre: '', telefono: '', tipo: 'Feria' };
  }

  guardarNuevoCliente() {
    if (!this.nuevoClienteForm.nombre.trim()) {
      this.notificationService.error('El nombre es obligatorio');
      return;
    }

    this.creandoCliente = true;
    this.clienteService.crearCliente(this.nuevoClienteForm).subscribe({
      next: (res: any) => {
        this.notificationService.success('Cliente creado con éxito');
        this.cargarClientes(); 
        this.clienteSeleccionadoId = res.data.id; 
        this.cerrarModalCliente();
        this.creandoCliente = false;
      },
      error: (err) => {
        this.notificationService.error('Error al crear el cliente');
        this.creandoCliente = false;
      }
    });
  }

  onCamerasFound(devices: any[]): void {
    if (devices && devices.length > 0) {
      this.dispositivoActual = devices[0];
    }
  }

  onCodigoEscaneado(codigo: string): void {
    this.onCodigoEscaneadoCamara(codigo);
  }

  onInputFocus(): void {
    this.mostrarSugerencias = true;
  }

  onInputBlur(): void {
    setTimeout(() => this.mostrarSugerencias = false, 200);
  }

  quitarDelCarrito(index: number): void {
    this.eliminarDelCarrito(index);
  }

  confirmarVenta(): void {
    this.completarVenta();
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
        this.notificationService.error('Error al cargar la lista de productos');
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

  private ejecutarBusquedaInteligente(termino: string) {
    const terminoSaneado = this.normalizarTexto(termino);
    const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

    if (palabrasBuscadas.length === 0) {
      this.productosEncontrados = [];
      this.cd.detectChanges();
      return;
    }

    let resultados = this.productosCache.filter(p => 
      palabrasBuscadas.every(palabra => p._searchIndex.includes(palabra))
    );

    const terminoPrincipal = palabrasBuscadas[0];

    resultados.sort((a, b) => {
      const nombreA = this.normalizarTexto(a.nombre);
      const nombreB = this.normalizarTexto(b.nombre);

      if (a.codigo_barra === terminoSaneado) return -1;
      if (b.codigo_barra === terminoSaneado) return 1;

      const aEmpieza = nombreA.startsWith(terminoPrincipal) ? 1 : 0;
      const bEmpieza = nombreB.startsWith(terminoPrincipal) ? 1 : 0;
      
      if (aEmpieza !== bEmpieza) {
        return bEmpieza - aEmpieza; 
      }

      return nombreA.length - nombreB.length;
    });

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

    const productoEncontrado = this.productosCache.find(p => 
      (p.codigo_barra || '').trim() === codigoLimpio ||
      (p.codigo_proveedor || '').trim().toLowerCase() === codigoLimpio.toLowerCase()
    );

    if (productoEncontrado) {
      this.agregarAlCarrito(productoEncontrado);
    } else {
      this.notificationService.error(`No se encontró producto con código: ${codigoLimpio}`);
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

  agregarAlCarrito(producto: Producto | ProductoIndexado) {
    const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    
    if (itemExistente) {
      itemExistente.cantidad += 1;
    } else {
      const nuevoItem: ProductoCarrito = {
        producto: producto,
        cantidad: 1,
        precioUnitarioAplicado: 0, 
        subtotal: 0
      };
      this.carrito.unshift(nuevoItem);
    }
    
    this.calcularTotales();
    this.notificationService.success('Producto agregado al ticket');

    this.limpiarBusqueda(); 
    this.mostrarSugerencias = false; 
  }

  modificarCantidad(index: number, delta: number) {
    const item = this.carrito[index];
    const nuevaCantidad = item.cantidad + delta;
    
    if (nuevaCantidad > 0) {
      item.cantidad = nuevaCantidad;
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
    this.total = 0; 
    this.totalArticulos = 0;

    this.carrito.forEach(item => {
      let precioAplicado = item.producto.precio_efectivo || 0;

      if (this.metodoPago === 'TARJETA_LOCAL') {
        precioAplicado = item.producto.precio_tarjeta_local || 0;
      } else if (this.metodoPago === 'TARJETA') {
        precioAplicado = item.producto.precio_tarjeta || 0;
      }

      item.precioUnitarioAplicado = precioAplicado;
      item.subtotal = precioAplicado * item.cantidad;

      this.totalVenta += item.subtotal;
      this.total += item.subtotal; 
      this.totalArticulos += item.cantidad;
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
      this.notificationService.error('Agrega al menos un producto al carrito para vender');
      return;
    }

    if (confirm('¿Confirmar el cierre de esta venta?')) {
      this.procesando = true;

      const payload: VentaRequest = {
        metodo_pago: this.metodoPago,
        items: this.carrito.map(item => ({
          id_producto: item.producto.id!, 
          cantidad: item.cantidad
        })),
        cliente_id: this.clienteSeleccionadoId,
        estado: this.estadoVenta as 'COBRADA' | 'PENDIENTE',
        observaciones: this.observaciones ? this.observaciones : undefined,
        cuotas: this.metodoPago !== 'EFECTIVO' ? this.datosVenta.cuotas : 1
      };

      this.ventaService.crear(payload).pipe(
        finalize(() => {
          this.procesando = false;
          this.cd.detectChanges();
        })
      ).subscribe({
        next: () => {
          this.notificationService.success('¡Venta completada con éxito!');
          
          // Limpieza post-venta corregida
          this.carrito = [];
          this.clienteSeleccionadoId = null; // <-- ESTA ERA LA LÍNEA QUE FALLABA
          this.observaciones = '';
          this.estadoVenta = 'PENDIENTE';
          this.datosVenta.cuotas = 1;
          this.metodoPago = 'EFECTIVO';
          
          this.calcularTotales();
          this.limpiarBusqueda();
        },
        error: (err) => {
          console.error('Error al guardar la venta:', err);
          this.notificationService.error('Error al registrar la venta en la base de datos');
        }
      });
    }
  }
}
// import { Component, ElementRef, ViewChild, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { ProductoService } from '../../services/producto.service';
// import { VentaService, VentaRequest } from '../../services/venta.service';
// import { NotificationService } from '../../services/notification.service';
// import { ConfiguracionService } from '../../services/configuracion.service';
// import { Producto } from '../../Interfaces/producto.interface';
// import { Router } from '@angular/router';
// import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
// import { Subject, Subscription } from 'rxjs';
// import { ZXingScannerModule } from '@zxing/ngx-scanner';
// import { BarcodeFormat } from '@zxing/library';
// import { ClienteService } from '../../services/cliente.service';

// // EXTENDEMOS LA INTERFAZ PARA INCLUIR EL INDEX DE BÚSQUEDA
// interface ProductoIndexado extends Producto {
//   _searchIndex: string;
// }

// // ADAPTADA PARA QUE HAGA MATCH CON EL HTML (item.producto.nombre y item.cantidad)
// interface ProductoCarrito {
//   producto: ProductoIndexado | Producto;
//   cantidad: number;
//   precioUnitarioAplicado: number;
//   subtotal: number;
// }

// @Component({
//   selector: 'app-nueva-venta',
//   standalone: true,
//   imports: [CommonModule, FormsModule, ZXingScannerModule],
//   templateUrl: './nueva-venta.html'
// })
// export class NuevaVentaComponent implements OnInit, OnDestroy {
//   private productoService = inject(ProductoService);
//   private ventaService = inject(VentaService);
//   private notificationService = inject(NotificationService);
//   private configuracionService = inject(ConfiguracionService);
//   private clienteService = inject(ClienteService);
//   private router = inject(Router);
//   private cd = inject(ChangeDetectorRef);

//   @ViewChild('scanInput') scanInput!: ElementRef;

//   // --- VARIABLES NUEVAS REQUERIDAS POR EL HTML ---
//   dispositivoActual: any;
//   mostrarSugerencias: boolean = false;
//   autoEnter: boolean = false;
//   estadoVenta: 'PENDIENTE' | 'COBRADA' | string = 'PENDIENTE';
//   observaciones: string = '';
//   total: number = 0; // El HTML usa 'total' en lugar de 'totalVenta'

//   clientesDisponibles: any[] = [];
//   clienteSeleccionadoId: number | null = null;

//   mostrarModalCliente = false;
//   nuevoClienteForm = { nombre: '', telefono: '', tipo: 'Feria' };
//   creandoCliente = false;

//   datosVenta = {
//     cuotas: 1
//   };
//   // ------------------------------------------------

//   productosCache: ProductoIndexado[] = [];
//   productosEncontrados: ProductoIndexado[] = [];
//   carrito: ProductoCarrito[] = [];
  
//   busqueda: string = '';
//   private searchSubject = new Subject<string>();
//   private searchSubscription!: Subscription;

//   metodoPago: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA' = 'EFECTIVO';
//   codigoLeido: string = '';
  
//   recargoLocal: number = 0;   
//   recargoTarjeta: number = 0; 
//   descuentoEfectivo: number = 0;

//   totalVenta: number = 0;
//   totalArticulos: number = 0;
//   procesando: boolean = false;
//   cargandoProductos: boolean = true;

//   mostrarCamara = false;
//   formatosAdmitidos = [
//     BarcodeFormat.EAN_13, 
//     BarcodeFormat.EAN_8, 
//     BarcodeFormat.CODE_128, 
//     BarcodeFormat.QR_CODE
//   ];

//   ngOnInit() {
//     this.cargarConfiguracion();
//     this.cargarTodosLosProductos();
//     this.cargarClientes();

//     // MOTOR DE BÚSQUEDA REACTIVO
//     this.searchSubscription = this.searchSubject.pipe(
//       debounceTime(250),
//       distinctUntilChanged()
//     ).subscribe(termino => {
//       this.ejecutarBusquedaInteligente(termino);
//     });
//   }

//   ngOnDestroy() {
//     if (this.searchSubscription) {
//       this.searchSubscription.unsubscribe();
//     }
//   }

//   cargarClientes() {
//     this.clienteService.getClientes().subscribe({
//       next: (res: any) => {
//         this.clientesDisponibles = res.data;
//       },
//       error: (err) => console.error('Error cargando clientes:', err)
//     });
//   }

//   abrirModalCliente() {
//     this.mostrarModalCliente = true;
//   }

//   cerrarModalCliente() {
//     this.mostrarModalCliente = false;
//     this.nuevoClienteForm = { nombre: '', telefono: '', tipo: 'Feria' };
//   }

//   guardarNuevoCliente() {
//     if (!this.nuevoClienteForm.nombre.trim()) {
//       this.notificationService.error('El nombre es obligatorio');
//       return;
//     }

//     this.creandoCliente = true;
//     this.clienteService.crearCliente(this.nuevoClienteForm).subscribe({
//       next: (res: any) => {
//         this.notificationService.success('Cliente creado con éxito');
//         this.cargarClientes(); // Recargamos la lista
//         this.clienteSeleccionadoId = res.data.id; // Lo autoseleccionamos
//         this.cerrarModalCliente();
//         this.creandoCliente = false;
//       },
//       error: (err) => {
//         this.notificationService.error('Error al crear el cliente');
//         this.creandoCliente = false;
//       }
//     });
//   }

//   // --- EVENTOS DE INTERFAZ Y HTML ---
//   onCamerasFound(devices: any[]): void {
//     if (devices && devices.length > 0) {
//       this.dispositivoActual = devices[0];
//     }
//   }

//   onCodigoEscaneado(codigo: string): void {
//     this.onCodigoEscaneadoCamara(codigo);
//   }

//   onInputFocus(): void {
//     this.mostrarSugerencias = true;
//   }

//   onInputBlur(): void {
//     // Le damos un pequeño delay para que si el usuario hace clic en una sugerencia, 
//     // registre el clic antes de ocultar el menú
//     setTimeout(() => this.mostrarSugerencias = false, 200);
//   }

//   quitarDelCarrito(index: number): void {
//     this.eliminarDelCarrito(index);
//   }

//   confirmarVenta(): void {
//     this.completarVenta();
//   }
//   // ----------------------------------

//   private normalizarTexto(texto: string | undefined | null): string {
//     if (!texto) return '';
//     return texto
//       .normalize('NFD')
//       .replace(/[\u0300-\u036f]/g, '') 
//       .toLowerCase()
//       .trim()
//       .replace(/\s+/g, ' '); 
//   }

//   cargarConfiguracion() {
//     this.configuracionService.obtener().subscribe({
//       next: (config) => {
//         if (config) {
//           this.recargoLocal = config.porcentaje_local || 0; 
//           this.recargoTarjeta = config.porcentaje_tarjeta || 0;
//           this.descuentoEfectivo = config.porcentaje_efectivo || 0;
//         }
//       },
//       error: (err) => console.error('Error cargando configuración', err)
//     });
//   }

//   cargarTodosLosProductos() {
//     this.cargandoProductos = true;
//     this.productoService.getAll('', true, 1, 10000).subscribe({
//       next: (resp) => {
//         this.productosCache = resp.data.map(p => ({
//           ...p,
//           _searchIndex: this.normalizarTexto(`${p.nombre} ${p.codigo_barra} ${p.codigo_proveedor} ${p.categoria}`)
//         }));
        
//         this.cargandoProductos = false;
//         this.cd.detectChanges();
//         setTimeout(() => this.enfocarScanner(), 100);
//       },
//       error: (err) => {
//         console.error('Error cargando productos:', err);
//         this.cargandoProductos = false;
//         this.notificationService.show('Error al cargar la lista de productos', 'error');
//         this.cd.detectChanges();
//       }
//     });
//   }

//   buscar(termino: string) {
//     this.busqueda = termino; 
//     if (termino.trim().length < 2) {
//       this.productosEncontrados = [];
//       return;
//     }
//     this.searchSubject.next(termino);
//   }

//   private ejecutarBusquedaInteligente(termino: string) {
//     const terminoSaneado = this.normalizarTexto(termino);
//     const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

//     if (palabrasBuscadas.length === 0) {
//       this.productosEncontrados = [];
//       this.cd.detectChanges();
//       return;
//     }

//     let resultados = this.productosCache.filter(p => 
//       palabrasBuscadas.every(palabra => p._searchIndex.includes(palabra))
//     );

//     const terminoPrincipal = palabrasBuscadas[0];

//     resultados.sort((a, b) => {
//       const nombreA = this.normalizarTexto(a.nombre);
//       const nombreB = this.normalizarTexto(b.nombre);

//       if (a.codigo_barra === terminoSaneado) return -1;
//       if (b.codigo_barra === terminoSaneado) return 1;

//       const aEmpieza = nombreA.startsWith(terminoPrincipal) ? 1 : 0;
//       const bEmpieza = nombreB.startsWith(terminoPrincipal) ? 1 : 0;
      
//       if (aEmpieza !== bEmpieza) {
//         return bEmpieza - aEmpieza; 
//       }

//       return nombreA.length - nombreB.length;
//     });

//     this.productosEncontrados = resultados.slice(0, 30);
//     this.cd.detectChanges();
//   }

//   limpiarBusqueda() {
//     this.busqueda = '';
//     this.productosEncontrados = [];
//     this.enfocarScanner();
//   }

//   agregarProductoManual(producto: Producto) {
//     this.agregarAlCarrito(producto);
//     this.limpiarBusqueda();
//   }

//   enfocarScanner() {
//     if (this.scanInput) {
//       this.scanInput.nativeElement.focus();
//     }
//   }

//   onScannerEnter() {
//     const codigoLimpio = (this.codigoLeido || '').trim();
//     if (!codigoLimpio) return;

//     const productoEncontrado = this.productosCache.find(p => 
//       (p.codigo_barra || '').trim() === codigoLimpio ||
//       (p.codigo_proveedor || '').trim().toLowerCase() === codigoLimpio.toLowerCase()
//     );

//     if (productoEncontrado) {
//       this.agregarAlCarrito(productoEncontrado);
//     } else {
//       this.notificationService.show(`No se encontró producto con código: ${codigoLimpio}`, 'error');
//     }

//     this.codigoLeido = '';
//     this.enfocarScanner();
//   }

//   toggleCamara() {
//     this.mostrarCamara = !this.mostrarCamara;
//     if (!this.mostrarCamara) {
//       setTimeout(() => this.enfocarScanner(), 100);
//     }
//   }

//   onCodigoEscaneadoCamara(codigo: string) {
//     this.codigoLeido = codigo;
//     this.mostrarCamara = false; 
//     this.onScannerEnter(); 
//   }

//   agregarAlCarrito(producto: Producto | ProductoIndexado) {
//     const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    
//     if (itemExistente) {
//       itemExistente.cantidad += 1;
//     } else {
//       const nuevoItem: ProductoCarrito = {
//         producto: producto,
//         cantidad: 1,
//         precioUnitarioAplicado: 0, 
//         subtotal: 0
//       };
//       this.carrito.unshift(nuevoItem);
//     }
    
//     this.calcularTotales();
//     this.notificationService.show('Producto agregado al ticket', 'success');

//     // --- ESTO ES LO NUEVO ---
//     this.limpiarBusqueda(); // Limpia el input de texto y vacía el array de encontrados
//     this.mostrarSugerencias = false; // Oculta la ventanita de sugerencias
//   }

//   modificarCantidad(index: number, delta: number) {
//     const item = this.carrito[index];
//     const nuevaCantidad = item.cantidad + delta;
    
//     if (nuevaCantidad > 0) {
//       item.cantidad = nuevaCantidad;
//       this.calcularTotales();
//     }
//   }

//   eliminarDelCarrito(index: number) {
//     this.carrito.splice(index, 1);
//     this.calcularTotales();
//   }

//   cambiarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA') {
//     this.metodoPago = metodo;
//     this.calcularTotales();
//   }

//   calcularTotales() {
//     this.totalVenta = 0;
//     this.total = 0; // Sincronizamos la variable que lee el HTML
//     this.totalArticulos = 0;

//     this.carrito.forEach(item => {
//       // Ahora accedemos al precio a través de item.producto
//       let precioAplicado = item.producto.precio_efectivo || 0;

//       if (this.metodoPago === 'TARJETA_LOCAL') {
//         precioAplicado = item.producto.precio_tarjeta_local || 0;
//       } else if (this.metodoPago === 'TARJETA') {
//         precioAplicado = item.producto.precio_tarjeta || 0;
//       }

//       item.precioUnitarioAplicado = precioAplicado;
//       item.subtotal = precioAplicado * item.cantidad;

//       this.totalVenta += item.subtotal;
//       this.total += item.subtotal; // Sincronizamos
//       this.totalArticulos += item.cantidad;
//     });
//   }

//   cancelarVenta() {
//     if (this.carrito.length > 0) {
//       if (confirm('¿Estás seguro de cancelar esta venta? Se perderán todos los artículos del ticket.')) {
//         this.carrito = [];
//         this.calcularTotales();
//         this.limpiarBusqueda();
//       }
//     } else {
//       this.router.navigate(['/dashboard']);
//     }
//   }

//   completarVenta() {
//     if (this.carrito.length === 0) {
//       this.notificationService.show('Agrega al menos un producto al carrito para vender', 'error');
//       return;
//     }

//     if (confirm('¿Confirmar el cierre de esta venta?')) {
//       this.procesando = true;

//       // Armamos el Payload con TODOS los datos del formulario
//       const payload: VentaRequest = {
//         metodo_pago: this.metodoPago,
//         items: this.carrito.map(item => ({
//           id_producto: item.producto.id!, 
//           cantidad: item.cantidad
//         })),
//         // Agregamos los datos del cliente
//         cliente_id: this.clienteSeleccionadoId,
//         // Agregamos estado, observaciones y cuotas
//         estado: this.estadoVenta as 'COBRADA' | 'PENDIENTE',
//         observaciones: this.observaciones ? this.observaciones : undefined,
//         cuotas: this.metodoPago !== 'EFECTIVO' ? this.datosVenta.cuotas : 1
//       };

//       this.ventaService.crear(payload).pipe(
//         finalize(() => {
//           this.procesando = false;
//           this.cd.detectChanges();
//         })
//       ).subscribe({
//         next: () => {
//           this.notificationService.show('¡Venta completada con éxito!', 'success');
          
//           // Limpiamos todo el formulario para la siguiente venta
//           this.carrito = [];
//           this.cliente_id = null;
//           this.observaciones = '';
//           this.estadoVenta = 'PENDIENTE';
//           this.datosVenta.cuotas = 1;
//           this.metodoPago = 'EFECTIVO';
          
//           this.calcularTotales();
//           this.limpiarBusqueda();
//         },
//         error: (err) => {
//           console.error('Error al guardar la venta:', err);
//           this.notificationService.show('Error al registrar la venta en la base de datos', 'error');
//         }
//       });
//     }
//   }

  /* completarVenta() {
    if (this.carrito.length === 0) {
      this.notificationService.show('Agrega al menos un producto al carrito para vender', 'error');
      return;
    }

    if (confirm('¿Confirmar el cierre de esta venta?')) {
      this.procesando = true;

      const payload: VentaRequest = {
        metodo_pago: this.metodoPago,
        items: this.carrito.map(item => ({
          id_producto: item.producto.id!, // Adaptado a la nueva estructura anidada
          cantidad: item.cantidad,
          precio_unitario: item.precioUnitarioAplicado,
          subtotal: item.subtotal
        }))
      };

      this.ventaService.crear(payload).pipe(
        finalize(() => {
          this.procesando = false;
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
  } */
}
