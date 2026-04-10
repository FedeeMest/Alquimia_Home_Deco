import { Component, ElementRef, ViewChild, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { VentaService, VentaRequest } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { ConfiguracionService } from '../../services/configuracion.service';
import { ClienteService } from '../../services/cliente.service'; 
import { Producto } from '../../Interfaces/producto.interface';
import { Router } from '@angular/router';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

interface ProductoIndexado extends Producto {
  _searchIndex: string;
}

interface ProductoCarrito {
  producto: ProductoIndexado | Producto;
  cantidad: number;
  precioUnitarioAplicado: number;
  subtotal: number;
  precioPersonalizado?: number; // <-- NUEVO: Guarda el precio que tipeaste a mano
  editandoPrecio?: boolean;     // <-- NUEVO: Controla si se ve el input o el texto
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

  // Estos datos ahora son de SOLO LECTURA para la vista
  datosCliente = {
    nombre: '',
    cuit: '',
    direccion: ''
  };

  datosVenta = {
    cuotas: 1
  };

  clientesTotales: any[] = [];
  clientesFiltrados: any[] = []; 
  clientesModalFiltrados: any[] = []; 

  mostrarModalPrecio: boolean = false;
  itemEditandoIndex: number = -1;
  precioEdicionTemp: number | null = null;
  
  clienteSeleccionadoId: string = '';
  busquedaClienteInput: string = '';
  
  mostrarSugerenciasCliente: boolean = false;
  mostrarModalClientes: boolean = false;
  busquedaModal: string = '';
  
  mostrarModalCrearCliente: boolean = false;
  nuevoClienteForm = {
    nombre: '',
    tipo: 'Minorista',
    telefono: '',
    email: '',
    cuit: '',
    direccion: '',
    notas: ''
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
        this.clientesTotales = res.data;
        this.clientesFiltrados = this.clientesTotales.slice(0, 5); 
        this.clientesModalFiltrados = this.clientesTotales;
      },
      error: (err) => console.error('Error cargando clientes', err)
    });
  }

  filtrarClientesRapido() {
    if (this.clienteSeleccionadoId && this.busquedaClienteInput !== this.datosCliente.nombre) {
        this.clienteSeleccionadoId = '';
        this.datosCliente.cuit = '';
        this.datosCliente.direccion = '';
    }
    this.datosCliente.nombre = this.busquedaClienteInput;

    const term = this.normalizarTexto(this.busquedaClienteInput);
    if (!term) {
        this.clientesFiltrados = this.clientesTotales.slice(0, 5);
        return;
    }
    this.clientesFiltrados = this.clientesTotales
        .filter(c => this.normalizarTexto(c.nombre).includes(term))
        .slice(0, 5); 
  }

  ocultarSugerenciasCliente() {
    setTimeout(() => this.mostrarSugerenciasCliente = false, 200);
  }

  seleccionarCliente(cliente: any) {
    this.clienteSeleccionadoId = cliente.id;
    this.busquedaClienteInput = cliente.nombre;
    
    this.datosCliente.nombre = cliente.nombre;
    this.datosCliente.cuit = cliente.cuit || cliente.telefono || ''; 
    this.datosCliente.direccion = cliente.direccion || cliente.email || '';
    
    this.mostrarSugerenciasCliente = false;
  }

  abrirModalClientes() {
    this.mostrarModalClientes = true;
    this.busquedaModal = '';
    this.clientesModalFiltrados = this.clientesTotales;
  }

  cerrarModalClientes() {
    this.mostrarModalClientes = false;
  }

  filtrarClientesModal() {
    const term = this.normalizarTexto(this.busquedaModal);
    if (!term) {
        this.clientesModalFiltrados = this.clientesTotales;
        return;
    }
    this.clientesModalFiltrados = this.clientesTotales.filter(c => this.normalizarTexto(c.nombre).includes(term));
  }

  abrirModalCrearCliente() {
    this.mostrarModalCrearCliente = true;
    this.nuevoClienteForm = {
      nombre: this.busquedaClienteInput || '',
      tipo: 'Minorista',
      telefono: '',
      email: '',
      cuit: '',
      direccion: '',
      notas: ''
    };
  }

  cerrarModalCrearCliente() {
    this.mostrarModalCrearCliente = false;
  }

  guardarNuevoCliente() {
    if (!this.nuevoClienteForm.nombre.trim()) {
        this.notificationService.show('El nombre es obligatorio', 'error');
        return;
    }

    this.clienteService.crearCliente(this.nuevoClienteForm).subscribe({
        next: (res: any) => {
            const nuevoCli = res.data;
            this.clientesTotales.push(nuevoCli);
            this.clientesTotales.sort((a,b) => a.nombre.localeCompare(b.nombre));
            
            this.seleccionarCliente(nuevoCli);
            
            this.cerrarModalCrearCliente();
            this.notificationService.show('Cliente/Feria registrado con éxito', 'success');
        },
        error: () => this.notificationService.show('Error al registrar cliente', 'error')
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
    this.notificationService.show('Producto agregado al ticket', 'success');

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
      // 1. Buscamos el precio base según el método de pago
      let precioBase = item.producto.precio_efectivo || 0;
      if (this.metodoPago === 'TARJETA_LOCAL') {
        precioBase = item.producto.precio_tarjeta_local || 0;
      } else if (this.metodoPago === 'TARJETA') {
        precioBase = item.producto.precio_tarjeta || 0;
      }

      // 2. Si el vendedor le puso un precio manual, lo usamos. Si no, usamos el base.
      let precioAplicado = item.precioPersonalizado !== undefined ? item.precioPersonalizado : precioBase;

      item.precioUnitarioAplicado = precioAplicado;
      item.subtotal = precioAplicado * item.cantidad;

      this.totalVenta += item.subtotal;
      this.total += item.subtotal; 
      this.totalArticulos += item.cantidad;
    });
  }

  fijarPrecioManual(index: number, nuevoPrecio: number | string) {
    const val = Number(nuevoPrecio);
    if (!isNaN(val) && val >= 0) {
      this.carrito[index].precioPersonalizado = val;
      this.carrito[index].editandoPrecio = false;
      this.calcularTotales();
    }
  }

  restablecerPrecio(index: number) {
    this.carrito[index].precioPersonalizado = undefined;
    this.carrito[index].editandoPrecio = false;
    this.calcularTotales();
  }

  // calcularTotales() {
  //   this.totalVenta = 0;
  //   this.total = 0; 
  //   this.totalArticulos = 0;

  //   this.carrito.forEach(item => {
  //     let precioAplicado = item.producto.precio_efectivo || 0;

  //     if (this.metodoPago === 'TARJETA_LOCAL') {
  //       precioAplicado = item.producto.precio_tarjeta_local || 0;
  //     } else if (this.metodoPago === 'TARJETA') {
  //       precioAplicado = item.producto.precio_tarjeta || 0;
  //     }

  //     item.precioUnitarioAplicado = precioAplicado;
  //     item.subtotal = precioAplicado * item.cantidad;

  //     this.totalVenta += item.subtotal;
  //     this.total += item.subtotal; 
  //     this.totalArticulos += item.cantidad;
  //   });
  // }

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
      this.procesando = true;

      // PAYLOAD LIMPIO: Solo enviamos el cliente_id
      const payload: VentaRequest = {
        metodo_pago: this.metodoPago,
        items: this.carrito.map(item => ({
          id_producto: item.producto.id!, 
          cantidad: item.cantidad,
          precio_modificado: item.precioPersonalizado // <-- SE ENVÍA AL BACKEND SOLO SI LO MODIFICASTE
        })),
        cliente_id: this.clienteSeleccionadoId ? Number(this.clienteSeleccionadoId) : undefined, 
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
          this.notificationService.show('¡Venta completada con éxito!', 'success');
          
          this.carrito = [];
          this.datosCliente = { nombre: '', cuit: '', direccion: '' };
          this.observaciones = '';
          this.estadoVenta = 'PENDIENTE';
          this.datosVenta.cuotas = 1;
          this.metodoPago = 'EFECTIVO';
          
          this.clienteSeleccionadoId = '';
          this.busquedaClienteInput = '';

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

  abrirModalPrecio(index: number) {
    this.itemEditandoIndex = index;
    const item = this.carrito[index];
    this.precioEdicionTemp = item.precioPersonalizado !== undefined ? item.precioPersonalizado : item.precioUnitarioAplicado;
    this.mostrarModalPrecio = true;
  }

  cerrarModalPrecio() {
    this.mostrarModalPrecio = false;
    this.itemEditandoIndex = -1;
    this.precioEdicionTemp = null;
  }

  guardarPrecioManual() {
    if (this.itemEditandoIndex > -1 && this.precioEdicionTemp !== null && this.precioEdicionTemp >= 0) {
      this.carrito[this.itemEditandoIndex].precioPersonalizado = Number(this.precioEdicionTemp);
      this.calcularTotales();
      this.cerrarModalPrecio();
    }
  }

  restablecerPrecioModal() {
    if (this.itemEditandoIndex > -1) {
      this.carrito[this.itemEditandoIndex].precioPersonalizado = undefined;
      this.calcularTotales();
      this.cerrarModalPrecio();
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
// import { ClienteService } from '../../services/cliente.service'; 
// import { Producto } from '../../Interfaces/producto.interface';
// import { Router } from '@angular/router';
// import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
// import { Subject, Subscription } from 'rxjs';
// import { ZXingScannerModule } from '@zxing/ngx-scanner';
// import { BarcodeFormat } from '@zxing/library';

// interface ProductoIndexado extends Producto {
//   _searchIndex: string;
// }

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

//   dispositivoActual: any;
//   mostrarSugerencias: boolean = false;
//   autoEnter: boolean = false;
//   estadoVenta: 'PENDIENTE' | 'COBRADA' | string = 'PENDIENTE';
//   observaciones: string = '';
//   total: number = 0; 

//   datosCliente = {
//     nombre: '',
//     cuit: '',
//     direccion: ''
//   };

//   datosVenta = {
//     cuotas: 1
//   };

//   // --- VARIABLES PARA LA LÓGICA DE CLIENTES ---
//   clientesTotales: any[] = [];
//   clientesFiltrados: any[] = []; 
//   clientesModalFiltrados: any[] = []; 
  
//   clienteSeleccionadoId: string = '';
//   busquedaClienteInput: string = '';
  
//   mostrarSugerenciasCliente: boolean = false;
//   mostrarModalClientes: boolean = false;
//   busquedaModal: string = '';
  
//   // Lógica de Modal Crear Cliente
//   mostrarModalCrearCliente: boolean = false;
//   nuevoClienteForm = {
//     nombre: '',
//     tipo: 'Minorista',
//     telefono: '',
//     email: '',
//     cuit: '',
//     direccion: '',
//     notas: ''
//   };

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

//   // =========================================================================
//   // LÓGICA DE CLIENTES
//   // =========================================================================
//   cargarClientes() {
//     this.clienteService.getClientes().subscribe({
//       next: (res: any) => {
//         this.clientesTotales = res.data;
//         this.clientesFiltrados = this.clientesTotales.slice(0, 5); 
//         this.clientesModalFiltrados = this.clientesTotales;
//       },
//       error: (err) => console.error('Error cargando clientes', err)
//     });
//   }

//   filtrarClientesRapido() {
//     if (this.clienteSeleccionadoId && this.busquedaClienteInput !== this.datosCliente.nombre) {
//         this.clienteSeleccionadoId = '';
//     }
//     this.datosCliente.nombre = this.busquedaClienteInput;

//     const term = this.normalizarTexto(this.busquedaClienteInput);
//     if (!term) {
//         this.clientesFiltrados = this.clientesTotales.slice(0, 5);
//         return;
//     }
//     this.clientesFiltrados = this.clientesTotales
//         .filter(c => this.normalizarTexto(c.nombre).includes(term))
//         .slice(0, 5); 
//   }

//   ocultarSugerenciasCliente() {
//     setTimeout(() => this.mostrarSugerenciasCliente = false, 200);
//   }

//   seleccionarCliente(cliente: any) {
//     this.clienteSeleccionadoId = cliente.id;
//     this.busquedaClienteInput = cliente.nombre;
    
//     this.datosCliente.nombre = cliente.nombre;
//     this.datosCliente.cuit = cliente.cuit || cliente.telefono || ''; 
//     this.datosCliente.direccion = cliente.direccion || cliente.email || '';
    
//     this.mostrarSugerenciasCliente = false;
//   }

//   abrirModalClientes() {
//     this.mostrarModalClientes = true;
//     this.busquedaModal = '';
//     this.clientesModalFiltrados = this.clientesTotales;
//   }

//   cerrarModalClientes() {
//     this.mostrarModalClientes = false;
//   }

//   filtrarClientesModal() {
//     const term = this.normalizarTexto(this.busquedaModal);
//     if (!term) {
//         this.clientesModalFiltrados = this.clientesTotales;
//         return;
//     }
//     this.clientesModalFiltrados = this.clientesTotales.filter(c => this.normalizarTexto(c.nombre).includes(term));
//   }

//   // --- Lógica del POPUP CREAR CLIENTE ---
//   abrirModalCrearCliente() {
//     this.mostrarModalCrearCliente = true;
//     // Precompletamos el nombre si el usuario ya había tipeado algo en la búsqueda
//     this.nuevoClienteForm = {
//       nombre: this.busquedaClienteInput || '',
//       tipo: 'Minorista',
//       telefono: '',
//       email: '',
//       cuit: '',
//       direccion: '',
//       notas: ''
//     };
//   }

//   cerrarModalCrearCliente() {
//     this.mostrarModalCrearCliente = false;
//   }

//   guardarNuevoCliente() {
//     if (!this.nuevoClienteForm.nombre.trim()) {
//         this.notificationService.show('El nombre es obligatorio', 'error');
//         return;
//     }

//     this.clienteService.crearCliente(this.nuevoClienteForm).subscribe({
//         next: (res: any) => {
//             const nuevoCli = res.data;
//             this.clientesTotales.push(nuevoCli);
//             this.clientesTotales.sort((a,b) => a.nombre.localeCompare(b.nombre));
            
//             // Lo seleccionamos automáticamente
//             this.seleccionarCliente(nuevoCli);
            
//             this.cerrarModalCrearCliente();
//             this.notificationService.show('Cliente/Feria registrado con éxito', 'success');
//         },
//         error: () => this.notificationService.show('Error al registrar cliente', 'error')
//     });
//   }
//   // =========================================================================

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
//     setTimeout(() => this.mostrarSugerencias = false, 200);
//   }

//   quitarDelCarrito(index: number): void {
//     this.eliminarDelCarrito(index);
//   }

//   confirmarVenta(): void {
//     this.completarVenta();
//   }

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

//     this.limpiarBusqueda(); 
//     this.mostrarSugerencias = false; 
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
//     this.total = 0; 
//     this.totalArticulos = 0;

//     this.carrito.forEach(item => {
//       let precioAplicado = item.producto.precio_efectivo || 0;

//       if (this.metodoPago === 'TARJETA_LOCAL') {
//         precioAplicado = item.producto.precio_tarjeta_local || 0;
//       } else if (this.metodoPago === 'TARJETA') {
//         precioAplicado = item.producto.precio_tarjeta || 0;
//       }

//       item.precioUnitarioAplicado = precioAplicado;
//       item.subtotal = precioAplicado * item.cantidad;

//       this.totalVenta += item.subtotal;
//       this.total += item.subtotal; 
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

//       const payload: VentaRequest = {
//         metodo_pago: this.metodoPago,
//         items: this.carrito.map(item => ({
//           id_producto: item.producto.id!, 
//           cantidad: item.cantidad
//         })),
//         cliente_id: this.clienteSeleccionadoId ? Number(this.clienteSeleccionadoId) : undefined, 
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
          
//           this.carrito = [];
//           this.datosCliente = { nombre: '', cuit: '', direccion: '' };
//           this.observaciones = '';
//           this.estadoVenta = 'PENDIENTE';
//           this.datosVenta.cuotas = 1;
//           this.metodoPago = 'EFECTIVO';
          
//           this.clienteSeleccionadoId = '';
//           this.busquedaClienteInput = '';

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
// }
