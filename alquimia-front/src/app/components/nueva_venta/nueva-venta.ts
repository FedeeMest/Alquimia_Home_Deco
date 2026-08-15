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
  precioPersonalizado?: number;
  origen?: 'almacen' | 'camion';
  
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

  datosCliente = {
    nombre: '',
    cuit: '',
    direccion: '',
    tipo: ''
  };

  datosVenta = {
    cuotas: 1
  };

  clientesFiltrados: any[] = [];       // sugerencias rápidas (máx 5)
  clientesModalFiltrados: any[] = [];  // resultados del modal (máx 30)
  cargandoClientes: boolean = false;
  cargandoClientesModal: boolean = false;

  clienteSeleccionadoId: string = '';
  busquedaClienteInput: string = '';

  mostrarSugerenciasCliente: boolean = false;
  mostrarModalClientes: boolean = false;
  busquedaModal: string = '';

  private clienteSearchSubject = new Subject<string>();
  private clienteSearchSubscription!: Subscription;

  private clienteModalSearchSubject = new Subject<string>();
  private clienteModalSearchSubscription!: Subscription;
  
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

  mostrarModalPrecio: boolean = false;
  itemEditandoIndex: number = -1;
  precioEdicionTemp: number | null = null;

  productosCache: ProductoIndexado[] = [];
  productosEncontrados: ProductoIndexado[] = [];
  carrito: ProductoCarrito[] = [];
  
  busqueda: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;

  // Navegación por teclado
  indiceSeleccionado: number = -1;

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
  this.cargarSugerenciasClientesIniciales(); 

  this.searchSubscription = this.searchSubject.pipe(
    debounceTime(150),
    distinctUntilChanged()
  ).subscribe(termino => this.ejecutarBusquedaInteligente(termino));

  // Búsqueda dinámica de clientes (input rápido)
  this.clienteSearchSubscription = this.clienteSearchSubject.pipe(
    debounceTime(300),
    distinctUntilChanged()
  ).subscribe(termino => this.buscarClientesServidor(termino));

  // Búsqueda dinámica de clientes (modal "Todos los clientes")
  this.clienteModalSearchSubscription = this.clienteModalSearchSubject.pipe(
    debounceTime(300),
    distinctUntilChanged()
  ).subscribe(termino => this.buscarClientesModalServidor(termino));
}

ngOnDestroy() {
  if (this.searchSubscription) this.searchSubscription.unsubscribe();
  if (this.clienteSearchSubscription) this.clienteSearchSubscription.unsubscribe();
  if (this.clienteModalSearchSubscription) this.clienteModalSearchSubscription.unsubscribe();
}

  // ==========================================
  // LÓGICA DEL BUSCADOR (Estilo MercadoLibre)
  // ==========================================
  buscar(termino: string) {
    this.busqueda = termino; 
    this.mostrarSugerencias = true; 
    
    if (termino.trim().length < 2) {
      this.productosEncontrados = [];
      this.indiceSeleccionado = -1;
      return;
    }
    this.searchSubject.next(termino);
  }

  private ejecutarBusquedaInteligente(termino: string) {
    const terminoSaneado = this.normalizarTexto(termino);
    const palabrasBuscadas = terminoSaneado.split(' ').filter(p => p.length > 0);

    if (palabrasBuscadas.length === 0) {
      this.productosEncontrados = [];
      this.indiceSeleccionado = -1;
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
    this.indiceSeleccionado = -1; // Resetear selección con los nuevos resultados
    this.cd.detectChanges();
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.productosEncontrados = [];
    this.indiceSeleccionado = -1;
    this.mostrarSugerencias = false;

    // Vaciado físico instantáneo del input
    if (this.scanInput && this.scanInput.nativeElement) {
        this.scanInput.nativeElement.value = '';
    }

    this.cd.detectChanges(); 
    this.enfocarScanner();
  }

  // Cambiamos (event: KeyboardEvent) por (event: any)
  navegarSugerencias(event: any) {
    if (!this.mostrarSugerencias || this.productosEncontrados.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.indiceSeleccionado = (this.indiceSeleccionado + 1) % this.productosEncontrados.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.indiceSeleccionado = this.indiceSeleccionado <= 0 ? this.productosEncontrados.length - 1 : this.indiceSeleccionado - 1;
    }
  }

  manejarEnter(event?: Event) {
    if (event) event.preventDefault();

    if (this.indiceSeleccionado >= 0 && this.indiceSeleccionado < this.productosEncontrados.length) {
        this.agregarAlCarrito(this.productosEncontrados[this.indiceSeleccionado]);
        return;
    }

    const codigoLimpio = this.busqueda.trim();
    const coincidenciaExacta = this.productosCache.find(p => p.codigo_barra === codigoLimpio);
    
    if (coincidenciaExacta) {
        this.agregarAlCarrito(coincidenciaExacta);
        return;
    }

    if (this.productosEncontrados.length > 0) {
        this.agregarAlCarrito(this.productosEncontrados[0]);
    }
  }

  // ==========================================
  // CARRITO Y STOCK
  // ==========================================
  agregarAlCarrito(producto: Producto | ProductoIndexado) {
    const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    const stockDisponible = producto.stock || 0; 
    
    if (itemExistente) {
      if (itemExistente.cantidad + 1 > stockDisponible) {
        this.notificationService.warning(`Stock insuficiente. Solo hay ${stockDisponible} unidades disponibles.`);
        return;
      }
      itemExistente.cantidad += 1;
    } else {
      if (stockDisponible < 1) {
        this.notificationService.error(`El producto no tiene stock disponible.`);
        return;
      }

      const nuevoItem: ProductoCarrito = {
        producto: producto,
        cantidad: 1,
        precioUnitarioAplicado: 0, 
        subtotal: 0,
        origen: 'almacen'
      };
      this.carrito.unshift(nuevoItem);
    }
    
    this.calcularTotales();
    this.notificationService.success('Producto agregado al ticket');
    this.limpiarBusqueda(); 
  }

  validarCantidadCarrito(index: number, valor: any) {
    const item = this.carrito[index];
    const stockDisponible = item.producto.stock || 0;
    
    let nuevaCantidad = parseInt(valor, 10);

    if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
        nuevaCantidad = 1;
    } 

    if (nuevaCantidad > stockDisponible) {
        this.notificationService.warning(`Stock máximo alcanzado (${stockDisponible} unidades).`);
        item.cantidad = -1; 
        this.cd.detectChanges(); 
        
        setTimeout(() => {
            item.cantidad = stockDisponible;
            this.calcularTotales();
            this.cd.detectChanges();
        }, 0);
        return; 
    }

    item.cantidad = nuevaCantidad;
    this.calcularTotales();
  }

  quitarDelCarrito(index: number): void {
    this.eliminarDelCarrito(index);
  }

  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    this.calcularTotales();
  }

  // ==========================================
  // LÓGICA DE CLIENTES
  // ==========================================
cargarSugerenciasClientesIniciales() {
  this.clienteService.getClientes(1, 5).subscribe({
    next: (res: any) => this.clientesFiltrados = res.data || [],
    error: (err) => console.error('Error cargando clientes', err)
  });
}

filtrarClientesRapido() {
  // Si el usuario edita el texto después de haber seleccionado un cliente, lo desvinculamos
  if (this.clienteSeleccionadoId && this.busquedaClienteInput !== this.datosCliente.nombre) {
    this.clienteSeleccionadoId = '';
    this.datosCliente.cuit = '';
    this.datosCliente.direccion = '';
    this.datosCliente.tipo = '';
    this.calcularTotales();
  }
  this.datosCliente.nombre = this.busquedaClienteInput;

  const term = this.busquedaClienteInput.trim();
  if (!term) {
    this.cargarSugerenciasClientesIniciales();
    return;
  }

  this.cargandoClientes = true;
  this.clienteSearchSubject.next(term);
}

private buscarClientesServidor(termino: string) {
  this.clienteService.getClientes(1, 5, termino).subscribe({
    next: (res: any) => {
      this.clientesFiltrados = res.data || [];
      this.cargandoClientes = false;
      this.cd.detectChanges();
    },
    error: (err) => {
      console.error('Error buscando clientes', err);
      this.cargandoClientes = false;
      this.cd.detectChanges();
    }
  });
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
  this.datosCliente.tipo = cliente.tipo || ''; 

  this.mostrarSugerenciasCliente = false;
  this.calcularTotales();
}

abrirModalClientes() {
  this.mostrarModalClientes = true;
  this.busquedaModal = '';
  this.cargarClientesModalIniciales();
}

cerrarModalClientes() {
  this.mostrarModalClientes = false;
}

private cargarClientesModalIniciales() {
  this.cargandoClientesModal = true;
  this.clienteService.getClientes(1, 30).subscribe({
    next: (res: any) => {
      this.clientesModalFiltrados = res.data || [];
      this.cargandoClientesModal = false;
      this.cd.detectChanges();
    },
    error: (err) => {
      console.error('Error cargando clientes', err);
      this.cargandoClientesModal = false;
      this.cd.detectChanges();
    }
  });
}

filtrarClientesModal() {
  const term = this.busquedaModal.trim();
  if (!term) {
    this.cargarClientesModalIniciales();
    return;
  }
  this.cargandoClientesModal = true;
  this.clienteModalSearchSubject.next(term);
}

private buscarClientesModalServidor(termino: string) {
  this.clienteService.getClientes(1, 30, termino).subscribe({
    next: (res: any) => {
      this.clientesModalFiltrados = res.data || [];
      this.cargandoClientesModal = false;
      this.cd.detectChanges();
    },
    error: (err) => {
      console.error('Error buscando clientes', err);
      this.cargandoClientesModal = false;
      this.cd.detectChanges();
    }
  });
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
    this.notificationService.error('El nombre es obligatorio');
    return;
  }

  this.clienteService.crearCliente(this.nuevoClienteForm).subscribe({
    next: (res: any) => {
      const nuevoCli = res.data;
      this.seleccionarCliente(nuevoCli);
      this.cerrarModalCrearCliente();
      this.notificationService.success('Cliente/Feria registrado con éxito');
    },
    error: () => this.notificationService.error('Error al registrar cliente')
  });
}

  // Formateadores Modal Cliente
  onDocumentoModalChange(valor: string) {
    this.nuevoClienteForm.cuit = this.formatearDocumento(valor);
  }

  onTelefonoModalChange(valor: string) {
    this.nuevoClienteForm.telefono = this.formatearTelefono(valor);
  }

  private formatearDocumento(valor: string): string {
    if (!valor) return '';
    let num = valor.replace(/\D/g, ''); 
    if (num.length <= 8) return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (num.length > 11) num = num.substring(0, 11);
    let cuitFormateado = num.substring(0, 2);
    if (num.length > 2) cuitFormateado += '-' + num.substring(2, 10);
    if (num.length > 10) cuitFormateado += '-' + num.substring(10, 11);
    return cuitFormateado;
  }

  private formatearTelefono(valor: string): string {
    if (!valor) return '';
    let num = valor.replace(/\D/g, ''); 
    if (num.length > 10) num = num.substring(0, 10); 
    if (num.length <= 3) return num;
    if (num.length <= 6) return `${num.substring(0, 3)} ${num.substring(3)}`;
    return `${num.substring(0, 3)} ${num.substring(3, 6)}-${num.substring(6)}`;
  }

  // ==========================================
  // PRECIOS Y TOTALES
  // ==========================================
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

  cambiarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA_LOCAL' | 'TARJETA') {
    this.metodoPago = metodo;
    this.calcularTotales();
  }

  getPrecioMostrado(p: any): number {
    if (this.datosCliente.tipo?.toLowerCase() === 'familia') {
        return p.precio_costo || 0;
    }
    if (this.metodoPago === 'TARJETA_LOCAL') return p.precio_tarjeta_local || 0;
    if (this.metodoPago === 'TARJETA') return p.precio_tarjeta || 0;
    return p.precio_efectivo || 0;
  }

  calcularTotales() {
    this.totalVenta = 0;
    this.total = 0; 
    this.totalArticulos = 0;
    const esFamilia = this.datosCliente.tipo?.toLowerCase() === 'familia';

    this.carrito.forEach(item => {
      let precioBase = item.producto.precio_efectivo || 0;

      if (esFamilia) {
        precioBase = item.producto.precio_costo || 0;
      } else {
        if (this.metodoPago === 'TARJETA_LOCAL') {
          precioBase = item.producto.precio_tarjeta_local || 0;
        } else if (this.metodoPago === 'TARJETA') {
          precioBase = item.producto.precio_tarjeta || 0;
        }
      }

      let precioAplicado = item.precioPersonalizado !== undefined ? item.precioPersonalizado : precioBase;
      item.precioUnitarioAplicado = precioAplicado;
      item.subtotal = precioAplicado * item.cantidad;

      this.totalVenta += item.subtotal;
      this.total += item.subtotal; 
      this.totalArticulos += item.cantidad;
    });
  }

  // ==========================================
  // FUNCIONES DE SOPORTE Y CÁMARA
  // ==========================================
  private normalizarTexto(texto: string | undefined | null): string {
    if (!texto) return '';
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); 
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

  enfocarScanner() {
    if (this.scanInput) {
      this.scanInput.nativeElement.focus();
    }
  }

  onCamerasFound(devices: any[]): void {
    if (devices && devices.length > 0) {
      this.dispositivoActual = devices[0];
    }
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
    
    // Simula comportamiento de Enter pero directamente con el código de la cámara
    const coincidenciaExacta = this.productosCache.find(p => p.codigo_barra === codigo || p.codigo_proveedor?.toLowerCase() === codigo.toLowerCase());
    if (coincidenciaExacta) {
        this.agregarAlCarrito(coincidenciaExacta);
    } else {
        this.notificationService.error(`No se encontró producto con código: ${codigo}`);
    }
    this.codigoLeido = '';
    this.enfocarScanner();
  }

  onCodigoEscaneado(codigo: string): void {
    this.onCodigoEscaneadoCamara(codigo);
  }

  // ==========================================
  // COMPLETAR O CANCELAR VENTA
  // ==========================================
  confirmarVenta(): void {
    this.completarVenta();
  }

  cancelarVenta() {
    if (this.carrito.length > 0) {
      if (confirm('¿Estás seguro de cancelar esta venta? Se perderán todos los artículos del ticket.')) {
        this.carrito = [];
        this.calcularTotales();
        this.limpiarBusqueda();
      }
    } else {
      this.router.navigate(['/admin/ventas']);
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
          cantidad: item.cantidad,
          precio_modificado: item.precioPersonalizado,
          origen: item.origen || 'almacen'
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
          this.notificationService.success('¡Venta completada con éxito!');
          
          this.carrito = [];
          this.datosCliente = { nombre: '', cuit: '', direccion: '', tipo: '' }; 
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
          this.notificationService.error('Error al registrar la venta en la base de datos');
        }
      });
    }
  }
}
