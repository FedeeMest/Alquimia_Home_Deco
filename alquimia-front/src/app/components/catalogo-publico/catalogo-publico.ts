import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProductoService } from '../../services/producto.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);
  private notificationService = inject(NotificationService);
  
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  cantidadModal: number = 1;
  imagenAmpliada: string | null = null;
  agregadoExito: boolean = false; // <-- Nuevo estado visual para el botón
  
  // Listas de datos
  productosOriginales: any[] = [];
  productosFiltrados: any[] = [];
  
  // Paginación
  productosVisibles: any[] = []; 
  paginaActual: number = 1;
  itemsPorPagina: number = 12;

  cargando = true;

  // --- VARIABLES DE FILTROS ---
  terminoBusqueda: string = '';
  ordenSeleccionado: string = 'defecto';
  
  categoriasDisponibles: string[] = [];
  categoriaSeleccionada: string = '';
  mostrarCategorias: boolean = false; 

  cargandoMas: boolean = false;

  proveedoresDisponibles: string[] = [];
  proveedorSeleccionado: string = '';
  
  precioMin: number | null = null;
  precioMax: number | null = null;
  mostrarPrecio: boolean = false; 

  // Modales y Carrito
  productoSeleccionado: any = null;
  productoPendienteId: string | null = null; 
  carrito: { producto: any, cantidad: number }[] = [];
  isCarritoOpen: boolean = false;
  isFiltrosMobileOpen: boolean = false;

  ngOnInit() {
    this.cargarCatalogo();

    this.route.queryParams.subscribe(params => {
      const idProducto = params['producto'];
      
      if (idProducto) {
        if (this.productosOriginales.length > 0) {
          this.abrirModalPorId(idProducto);
        } else {
          this.productoPendienteId = idProducto;
        }
      } else {
        this.cerrarModalInterno();
      }
    });
  }

  getCantidadDisponible(producto: any): number {
    if (!producto) return 0;
    const stockTotal = producto.stock || 0;
    const itemEnCarrito = this.carrito.find(item => item.producto.id === producto.id);
    const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    
    return stockTotal - cantidadEnCarrito;
  }

  get totalCarritoTarjeta(): number {
    return this.carrito.reduce((total, item) => total + ((item.producto.precio_tarjeta || item.producto.precio) * item.cantidad), 0);
  }

  get totalCarritoEfectivo(): number {
    return this.carrito.reduce((total, item) => {
      const precioEfectivo = item.producto.precio_efectivo || item.producto.precio_tarjeta || item.producto.precio;
      return total + (precioEfectivo * item.cantidad);
    }, 0);
  }

  cargarCatalogo() {
    this.productoService.getPublicCatalog().subscribe({
      next: (res: any) => {
        const data = res.data ? res.data : res; 
        this.productosOriginales = data;
        this.productosFiltrados = [...this.productosOriginales];
        
        this.extraerFiltros(); 
        this.actualizarProductosVisibles();
        this.cargando = false;

        if (this.productoPendienteId) {
          this.abrirModalPorId(this.productoPendienteId);
          this.productoPendienteId = null; 
        }

        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error cargando el catálogo:', err);
        this.cargando = false;
        this.cd.detectChanges();
      }
    });
  }

  extraerFiltros() {
    const categoriasCount: { [key: string]: number } = {};
    const proveedoresSet = new Set<string>();
    
    this.productosOriginales.forEach(p => {
      if (p.categoria) {
        categoriasCount[p.categoria] = (categoriasCount[p.categoria] || 0) + 1;
      }
      if (p.proveedor) proveedoresSet.add(p.proveedor);
    });
    
    this.categoriasDisponibles = Object.keys(categoriasCount).sort((a, b) => categoriasCount[b] - categoriasCount[a]);
    this.proveedoresDisponibles = Array.from(proveedoresSet).sort();
  }

  seleccionarCategoria(cat: string) {
    this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
    this.aplicarFiltros();
  }

  seleccionarProveedor(prov: string) {
    this.proveedorSeleccionado = this.proveedorSeleccionado === prov ? '' : prov;
    this.aplicarFiltros();
  }

  toggleOrdenPrecio() {
    if (this.ordenSeleccionado === 'precio_asc') {
      this.ordenSeleccionado = 'precio_desc';
    } else if (this.ordenSeleccionado === 'precio_desc') {
      this.ordenSeleccionado = 'defecto';
    } else {
      this.ordenSeleccionado = 'precio_asc';
    }
    this.aplicarFiltros();
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.categoriaSeleccionada = '';
    this.proveedorSeleccionado = '';
    this.precioMin = null;
    this.precioMax = null;
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    let resultado = [...this.productosOriginales];

    if (this.terminoBusqueda.trim()) {
      const termino = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(termino) || 
        (p.categoria && p.categoria.toLowerCase().includes(termino)) ||
        (p.proveedor && p.proveedor.toLowerCase().includes(termino))
      );
    }

    if (this.categoriaSeleccionada) {
      resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
    }

    if (this.proveedorSeleccionado) {
      resultado = resultado.filter(p => p.proveedor === this.proveedorSeleccionado);
    }

    if (this.precioMin !== null && this.precioMin >= 0) {
      resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) >= this.precioMin!);
    }
    if (this.precioMax !== null && this.precioMax >= 0) {
      resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) <= this.precioMax!);
    }

    switch (this.ordenSeleccionado) {
      case 'precio_asc': 
        resultado.sort((a, b) => (a.precio_tarjeta || a.precio) - (b.precio_tarjeta || b.precio)); 
        break;
      case 'precio_desc': 
        resultado.sort((a, b) => (b.precio_tarjeta || b.precio) - (a.precio_tarjeta || a.precio)); 
        break;
      case 'nombre_asc': 
        resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)); 
        break;
      case 'nombre_desc': 
        resultado.sort((a, b) => b.nombre.localeCompare(a.nombre)); 
        break;
    }

    this.productosFiltrados = resultado;
    this.paginaActual = 1;
    this.actualizarProductosVisibles();
  }

  actualizarProductosVisibles() {
    const limite = this.paginaActual * this.itemsPorPagina;
    this.productosVisibles = this.productosFiltrados.slice(0, limite);
    this.cd.detectChanges();
  }

  cargarMas() {
    this.cargandoMas = true;
    setTimeout(() => {
      this.paginaActual++;
      this.actualizarProductosVisibles();
      this.cargandoMas = false;
      this.cd.detectChanges();
    }, 500); 
  }

  abrirModal(producto: any) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { producto: producto.id },
      queryParamsHandling: 'merge' 
    });
  }

  cerrarModal() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { producto: null },
      queryParamsHandling: 'merge'
    });
  }

  private abrirModalPorId(id: string) {
    const producto = this.productosOriginales.find(p => p.id.toString() === id.toString());
    if (producto) {
      this.productoSeleccionado = producto;
      this.cantidadModal = this.getCantidadDisponible(producto) > 0 ? 1 : 0;
      this.agregadoExito = false; // Reset por las dudas al abrir uno nuevo
      this.actualizarBodyOverflow();
      this.cd.detectChanges();
    }
  }

  private cerrarModalInterno() {
    if (this.productoSeleccionado) {
      this.productoSeleccionado = null;
      this.agregadoExito = false; // Reset al cerrar
      this.actualizarBodyOverflow();
      this.cd.detectChanges();
    }
  }

  abrirCarrito() {
    this.isCarritoOpen = true;
    this.actualizarBodyOverflow();
  }

  cerrarCarrito() {
    this.isCarritoOpen = false;
    this.actualizarBodyOverflow();
  }

  agregarAlCarrito(producto: any, cantidadSeleccionada: number = 1) {
    if (cantidadSeleccionada <= 0) return; 

    const stockTotal = producto.stock || 0;
    const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    const cantidadEnCarrito = itemExistente ? itemExistente.cantidad : 0;
    
    const stockRestante = stockTotal - cantidadEnCarrito;

    if (cantidadSeleccionada > stockRestante) {
        if (cantidadEnCarrito > 0) {
             this.notificationService.error(`Ya tenés ${cantidadEnCarrito} en el carrito. Solo podés agregar ${stockRestante} más.`);
        } else {
             this.notificationService.error(`Solo tenemos ${stockTotal} unidades en stock.`);
        }
        return;
    }

    if (itemExistente) {
      itemExistente.cantidad += cantidadSeleccionada;
    } else {
      this.carrito.push({ producto: producto, cantidad: cantidadSeleccionada });
    }

    this.notificationService.success(`Agregaste ${cantidadSeleccionada}x ${producto.nombre} al carrito.`);

    if (this.productoSeleccionado) {
      // Feedback visual del botón y retraso de 1.5s antes de cerrar
      this.agregadoExito = true;
      this.cd.detectChanges();

      setTimeout(() => {
        this.agregadoExito = false;
        this.cerrarModal(); 
        this.cd.detectChanges();
      }, 1500);
    }
  }

  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    if (this.carrito.length === 0) {
        this.cerrarCarrito();
    }
  }

  get cantidadItemsCarrito(): number {
    return this.carrito.reduce((total, item) => total + item.cantidad, 0);
  }

  enviarPedidoWhatsApp() {
    if (this.carrito.length === 0) return;

    const numeroWa = '5493401408588'; 
    let mensaje = '¡Hola Alquimia! Estoy interesado en estos productos:\n\n';

    this.carrito.forEach((item, index) => {
      const precioT = item.producto.precio_tarjeta || item.producto.precio;
      const precioE = item.producto.precio_efectivo || precioT;

      mensaje += `${index + 1}. *${item.producto.nombre}* (x${item.cantidad})\n`;
      mensaje += `   💳 Tarjeta: $${precioT * item.cantidad}\n`;
      mensaje += `   💵 Efectivo: $${precioE * item.cantidad}\n\n`;
    });

    mensaje += `*TOTAL*\n`;
    mensaje += `💳 *Tarjeta:* $${this.totalCarritoTarjeta}\n`;
    mensaje += `💵 *Efectivo/Transferencia:* $${this.totalCarritoEfectivo}\n\n`;

    const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  }

  consultarPorWhatsApp(producto: any) {
    const numeroWa = '5493401408588'; 
    const mensaje = `¡Hola Alquimia! Quería hacer una consulta sobre el producto: *${producto.nombre}*`;
    const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  }

  abrirImagenAmpliada(url: string | undefined) {
    if (url) {
      this.imagenAmpliada = url;
      this.actualizarBodyOverflow();
    }
  }

  cerrarImagenAmpliada() {
    this.imagenAmpliada = null;
    this.actualizarBodyOverflow();
  }

  trackById(index: number, item: any): number {
    return item.id;
  }

  actualizarBodyOverflow() {
    if (this.productoSeleccionado || this.isCarritoOpen || this.isFiltrosMobileOpen || this.imagenAmpliada) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
  }

  abrirFiltrosMobile() {
    this.isFiltrosMobileOpen = true;
    this.actualizarBodyOverflow();
  }

  cerrarFiltrosMobile() {
    this.isFiltrosMobileOpen = false;
    this.actualizarBodyOverflow();
  }

  get cantidadFiltrosActivos(): number {
    let contador = 0;
    if (this.categoriaSeleccionada) contador++;
    if (this.proveedorSeleccionado) contador++;
    if (this.precioMin !== null || this.precioMax !== null) contador++;
    if (this.terminoBusqueda) contador++;
    return contador;
  }
}

// import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { Router, ActivatedRoute } from '@angular/router';
// import { ProductoService } from '../../services/producto.service';
// import { NotificationService } from '../../services/notification.service';

// @Component({
//   selector: 'app-catalogo-publico',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './catalogo-publico.html'
// })
// export class CatalogoPublicoComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private cd = inject(ChangeDetectorRef);
//   private notificationService = inject(NotificationService);
  
//   private router = inject(Router);
//   private route = inject(ActivatedRoute);

//   cantidadModal: number = 1;
//   imagenAmpliada: string | null = null;
  
//   // Listas de datos
//   productosOriginales: any[] = [];
//   productosFiltrados: any[] = [];
  
//   // Paginación
//   productosVisibles: any[] = []; 
//   paginaActual: number = 1;
//   itemsPorPagina: number = 12;

//   cargando = true;

//   // --- VARIABLES DE FILTROS ---
//   terminoBusqueda: string = '';
//   ordenSeleccionado: string = 'defecto';
  
//   categoriasDisponibles: string[] = [];
//   categoriaSeleccionada: string = '';
//   mostrarCategorias: boolean = false; 

//   cargandoMas: boolean = false;

//   proveedoresDisponibles: string[] = [];
//   proveedorSeleccionado: string = '';
  
//   precioMin: number | null = null;
//   precioMax: number | null = null;
//   mostrarPrecio: boolean = false; 

//   // Modales y Carrito
//   productoSeleccionado: any = null;
//   productoPendienteId: string | null = null; 
//   carrito: { producto: any, cantidad: number }[] = [];
//   isCarritoOpen: boolean = false;
//   isFiltrosMobileOpen: boolean = false;

//   ngOnInit() {
//     this.cargarCatalogo();

//     this.route.queryParams.subscribe(params => {
//       const idProducto = params['producto'];
      
//       if (idProducto) {
//         if (this.productosOriginales.length > 0) {
//           this.abrirModalPorId(idProducto);
//         } else {
//           this.productoPendienteId = idProducto;
//         }
//       } else {
//         this.cerrarModalInterno();
//       }
//     });
//   }

//   getCantidadDisponible(producto: any): number {
//     if (!producto) return 0;
//     const stockTotal = producto.stock || 0;
//     const itemEnCarrito = this.carrito.find(item => item.producto.id === producto.id);
//     const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    
//     return stockTotal - cantidadEnCarrito;
//   }

//   get totalCarritoTarjeta(): number {
//     return this.carrito.reduce((total, item) => total + ((item.producto.precio_tarjeta || item.producto.precio) * item.cantidad), 0);
//   }

//   get totalCarritoEfectivo(): number {
//     return this.carrito.reduce((total, item) => {
//       const precioEfectivo = item.producto.precio_efectivo || item.producto.precio_tarjeta || item.producto.precio;
//       return total + (precioEfectivo * item.cantidad);
//     }, 0);
//   }

//   cargarCatalogo() {
//     this.productoService.getPublicCatalog().subscribe({
//       next: (res: any) => {
//         const data = res.data ? res.data : res; 
//         this.productosOriginales = data;
//         this.productosFiltrados = [...this.productosOriginales];
        
//         this.extraerFiltros(); 
//         this.actualizarProductosVisibles();
//         this.cargando = false;

//         if (this.productoPendienteId) {
//           this.abrirModalPorId(this.productoPendienteId);
//           this.productoPendienteId = null; 
//         }

//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error('❌ Error cargando el catálogo:', err);
//         this.cargando = false;
//         this.cd.detectChanges();
//       }
//     });
//   }

//   extraerFiltros() {
//     // 1. Contamos cuántos productos tiene cada categoría para poder ordenarlas por "más usadas"
//     const categoriasCount: { [key: string]: number } = {};
//     const proveedoresSet = new Set<string>();
    
//     this.productosOriginales.forEach(p => {
//       if (p.categoria) {
//         categoriasCount[p.categoria] = (categoriasCount[p.categoria] || 0) + 1;
//       }
//       if (p.proveedor) proveedoresSet.add(p.proveedor);
//     });
    
//     // 2. Ordenamos el array de categorías basándonos en el conteo (de mayor a menor)
//     this.categoriasDisponibles = Object.keys(categoriasCount).sort((a, b) => categoriasCount[b] - categoriasCount[a]);
    
//     this.proveedoresDisponibles = Array.from(proveedoresSet).sort();
//   }

//   seleccionarCategoria(cat: string) {
//     this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
//     this.aplicarFiltros();
//   }

//   seleccionarProveedor(prov: string) {
//     this.proveedorSeleccionado = this.proveedorSeleccionado === prov ? '' : prov;
//     this.aplicarFiltros();
//   }

//   // --- NUEVA FUNCIÓN PARA EL CHIP DE ORDENAMIENTO EN MOBILE ---
//   toggleOrdenPrecio() {
//     if (this.ordenSeleccionado === 'precio_asc') {
//       this.ordenSeleccionado = 'precio_desc';
//     } else if (this.ordenSeleccionado === 'precio_desc') {
//       this.ordenSeleccionado = 'defecto';
//     } else {
//       this.ordenSeleccionado = 'precio_asc';
//     }
//     this.aplicarFiltros();
//   }

//   limpiarBusqueda() {
//     this.terminoBusqueda = '';
//     this.categoriaSeleccionada = '';
//     this.proveedorSeleccionado = '';
//     this.precioMin = null;
//     this.precioMax = null;
//     this.aplicarFiltros();
//   }

//   aplicarFiltros() {
//     let resultado = [...this.productosOriginales];

//     if (this.terminoBusqueda.trim()) {
//       const termino = this.terminoBusqueda.toLowerCase().trim();
//       resultado = resultado.filter(p => 
//         p.nombre.toLowerCase().includes(termino) || 
//         (p.categoria && p.categoria.toLowerCase().includes(termino)) ||
//         (p.proveedor && p.proveedor.toLowerCase().includes(termino))
//       );
//     }

//     if (this.categoriaSeleccionada) {
//       resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
//     }

//     if (this.proveedorSeleccionado) {
//       resultado = resultado.filter(p => p.proveedor === this.proveedorSeleccionado);
//     }

//     if (this.precioMin !== null && this.precioMin >= 0) {
//       resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) >= this.precioMin!);
//     }
//     if (this.precioMax !== null && this.precioMax >= 0) {
//       resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) <= this.precioMax!);
//     }

//     switch (this.ordenSeleccionado) {
//       case 'precio_asc': 
//         resultado.sort((a, b) => (a.precio_tarjeta || a.precio) - (b.precio_tarjeta || b.precio)); 
//         break;
//       case 'precio_desc': 
//         resultado.sort((a, b) => (b.precio_tarjeta || b.precio) - (a.precio_tarjeta || a.precio)); 
//         break;
//       case 'nombre_asc': 
//         resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)); 
//         break;
//       case 'nombre_desc': 
//         resultado.sort((a, b) => b.nombre.localeCompare(a.nombre)); 
//         break;
//     }

//     this.productosFiltrados = resultado;
//     this.paginaActual = 1;
//     this.actualizarProductosVisibles();
//   }

//   actualizarProductosVisibles() {
//     const limite = this.paginaActual * this.itemsPorPagina;
//     this.productosVisibles = this.productosFiltrados.slice(0, limite);
//     this.cd.detectChanges();
//   }

//   cargarMas() {
//     this.cargandoMas = true;
//     setTimeout(() => {
//       this.paginaActual++;
//       this.actualizarProductosVisibles();
//       this.cargandoMas = false;
//       this.cd.detectChanges();
//     }, 500); 
//   }

//   abrirModal(producto: any) {
//     this.router.navigate([], {
//       relativeTo: this.route,
//       queryParams: { producto: producto.id },
//       queryParamsHandling: 'merge' 
//     });
//   }

//   cerrarModal() {
//     this.router.navigate([], {
//       relativeTo: this.route,
//       queryParams: { producto: null },
//       queryParamsHandling: 'merge'
//     });
//   }

//   private abrirModalPorId(id: string) {
//     const producto = this.productosOriginales.find(p => p.id.toString() === id.toString());
//     if (producto) {
//       this.productoSeleccionado = producto;
//       this.cantidadModal = this.getCantidadDisponible(producto) > 0 ? 1 : 0;
//       this.actualizarBodyOverflow();
//       this.cd.detectChanges();
//     }
//   }

//   private cerrarModalInterno() {
//     if (this.productoSeleccionado) {
//       this.productoSeleccionado = null;
//       this.actualizarBodyOverflow();
//       this.cd.detectChanges();
//     }
//   }

//   abrirCarrito() {
//     this.isCarritoOpen = true;
//     this.actualizarBodyOverflow();
//   }

//   cerrarCarrito() {
//     this.isCarritoOpen = false;
//     this.actualizarBodyOverflow();
//   }

//   agregarAlCarrito(producto: any, cantidadSeleccionada: number = 1) {
//     if (cantidadSeleccionada <= 0) return; 

//     const stockTotal = producto.stock || 0;
//     const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
//     const cantidadEnCarrito = itemExistente ? itemExistente.cantidad : 0;
    
//     const stockRestante = stockTotal - cantidadEnCarrito;

//     if (cantidadSeleccionada > stockRestante) {
//         if (cantidadEnCarrito > 0) {
//              this.notificationService.error(`Ya tenés ${cantidadEnCarrito} en el carrito. Solo podés agregar ${stockRestante} más.`);
//         } else {
//              this.notificationService.error(`Solo tenemos ${stockTotal} unidades en stock.`);
//         }
//         return;
//     }

//     if (itemExistente) {
//       itemExistente.cantidad += cantidadSeleccionada;
//     } else {
//       this.carrito.push({ producto: producto, cantidad: cantidadSeleccionada });
//     }

//     this.notificationService.success(`Agregaste ${cantidadSeleccionada}x ${producto.nombre} al carrito.`);

//     if (this.productoSeleccionado) {
//       this.cerrarModal(); 
//     }
//   }

//   eliminarDelCarrito(index: number) {
//     this.carrito.splice(index, 1);
//     if (this.carrito.length === 0) {
//         this.cerrarCarrito();
//     }
//   }

//   get cantidadItemsCarrito(): number {
//     return this.carrito.reduce((total, item) => total + item.cantidad, 0);
//   }

//   enviarPedidoWhatsApp() {
//     if (this.carrito.length === 0) return;

//     const numeroWa = '5493401408588'; 
//     let mensaje = '¡Hola Alquimia! Estoy interesado en estos productos:\n\n';

//     this.carrito.forEach((item, index) => {
//       const precioT = item.producto.precio_tarjeta || item.producto.precio;
//       const precioE = item.producto.precio_efectivo || precioT;

//       mensaje += `${index + 1}. *${item.producto.nombre}* (x${item.cantidad})\n`;
//       mensaje += `   💳 Tarjeta: $${precioT * item.cantidad}\n`;
//       mensaje += `   💵 Efectivo: $${precioE * item.cantidad}\n\n`;
//     });

//     mensaje += `*TOTAL*\n`;
//     mensaje += `💳 *Tarjeta:* $${this.totalCarritoTarjeta}\n`;
//     mensaje += `💵 *Efectivo/Transferencia:* $${this.totalCarritoEfectivo}\n\n`;

//     const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
//     window.open(url, '_blank');
//   }

//   consultarPorWhatsApp(producto: any) {
//     const numeroWa = '5493401408588'; 
//     const mensaje = `¡Hola Alquimia! Quería hacer una consulta sobre el producto: *${producto.nombre}*`;
//     const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
//     window.open(url, '_blank');
//   }

//   abrirImagenAmpliada(url: string | undefined) {
//     if (url) {
//       this.imagenAmpliada = url;
//       this.actualizarBodyOverflow();
//     }
//   }

//   cerrarImagenAmpliada() {
//     this.imagenAmpliada = null;
//     this.actualizarBodyOverflow();
//   }

//   trackById(index: number, item: any): number {
//     return item.id;
//   }

//   actualizarBodyOverflow() {
//     if (this.productoSeleccionado || this.isCarritoOpen || this.isFiltrosMobileOpen || this.imagenAmpliada) {
//         document.body.style.overflow = 'hidden';
//     } else {
//         document.body.style.overflow = 'auto';
//     }
//   }

//   abrirFiltrosMobile() {
//     this.isFiltrosMobileOpen = true;
//     this.actualizarBodyOverflow();
//   }

//   cerrarFiltrosMobile() {
//     this.isFiltrosMobileOpen = false;
//     this.actualizarBodyOverflow();
//   }

//   get cantidadFiltrosActivos(): number {
//     let contador = 0;
//     if (this.categoriaSeleccionada) contador++;
//     if (this.proveedorSeleccionado) contador++;
//     if (this.precioMin !== null || this.precioMax !== null) contador++;
//     if (this.terminoBusqueda) contador++;
//     return contador;
//   }
// }

// import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { Router, ActivatedRoute } from '@angular/router';
// import { ProductoService } from '../../services/producto.service';
// import { NotificationService } from '../../services/notification.service';

// @Component({
//   selector: 'app-catalogo-publico',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './catalogo-publico.html'
// })
// export class CatalogoPublicoComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private cd = inject(ChangeDetectorRef);
//   private notificationService = inject(NotificationService);
  
//   private router = inject(Router);
//   private route = inject(ActivatedRoute);

//   cantidadModal: number = 1;
//   imagenAmpliada: string | null = null;
  
//   // Listas de datos
//   productosOriginales: any[] = [];
//   productosFiltrados: any[] = [];
  
//   // Paginación
//   productosVisibles: any[] = []; 
//   paginaActual: number = 1;
//   itemsPorPagina: number = 12;

//   cargando = true;

//   // --- VARIABLES DE FILTROS ---
//   terminoBusqueda: string = '';
//   ordenSeleccionado: string = 'defecto';
  
//   categoriasDisponibles: string[] = [];
//   categoriaSeleccionada: string = '';
//   mostrarCategorias: boolean = false; 

//   cargandoMas: boolean = false;

//   proveedoresDisponibles: string[] = [];
//   proveedorSeleccionado: string = '';
  
//   precioMin: number | null = null;
//   precioMax: number | null = null;
//   mostrarPrecio: boolean = false; 

//   // Modales y Carrito
//   productoSeleccionado: any = null;
//   productoPendienteId: string | null = null; 
//   carrito: { producto: any, cantidad: number }[] = [];
//   isCarritoOpen: boolean = false;
//   isFiltrosMobileOpen: boolean = false;

//   ngOnInit() {
//     this.cargarCatalogo();

//     this.route.queryParams.subscribe(params => {
//       const idProducto = params['producto'];
      
//       if (idProducto) {
//         if (this.productosOriginales.length > 0) {
//           this.abrirModalPorId(idProducto);
//         } else {
//           this.productoPendienteId = idProducto;
//         }
//       } else {
//         this.cerrarModalInterno();
//       }
//     });
//   }

//   getCantidadDisponible(producto: any): number {
//     if (!producto) return 0;
//     const stockTotal = producto.stock || 0;
//     const itemEnCarrito = this.carrito.find(item => item.producto.id === producto.id);
//     const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    
//     return stockTotal - cantidadEnCarrito;
//   }

//   get totalCarritoTarjeta(): number {
//     return this.carrito.reduce((total, item) => total + ((item.producto.precio_tarjeta || item.producto.precio) * item.cantidad), 0);
//   }

//   get totalCarritoEfectivo(): number {
//     return this.carrito.reduce((total, item) => {
//       const precioEfectivo = item.producto.precio_efectivo || item.producto.precio_tarjeta || item.producto.precio;
//       return total + (precioEfectivo * item.cantidad);
//     }, 0);
//   }

//   cargarCatalogo() {
//     this.productoService.getPublicCatalog().subscribe({
//       next: (res: any) => {
//         const data = res.data ? res.data : res; 
//         this.productosOriginales = data;
//         this.productosFiltrados = [...this.productosOriginales];
        
//         this.extraerFiltros(); 
//         this.actualizarProductosVisibles();
//         this.cargando = false;

//         if (this.productoPendienteId) {
//           this.abrirModalPorId(this.productoPendienteId);
//           this.productoPendienteId = null; 
//         }

//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error('❌ Error cargando el catálogo:', err);
//         this.cargando = false;
//         this.cd.detectChanges();
//       }
//     });
//   }

//   extraerFiltros() {
//     const categoriasSet = new Set<string>();
//     const proveedoresSet = new Set<string>();
    
//     this.productosOriginales.forEach(p => {
//       if (p.categoria) categoriasSet.add(p.categoria);
//       if (p.proveedor) proveedoresSet.add(p.proveedor);
//     });
    
//     this.categoriasDisponibles = Array.from(categoriasSet).sort();
//     this.proveedoresDisponibles = Array.from(proveedoresSet).sort();
//   }

//   seleccionarCategoria(cat: string) {
//     this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
//     this.aplicarFiltros();
//   }

//   seleccionarProveedor(prov: string) {
//     this.proveedorSeleccionado = this.proveedorSeleccionado === prov ? '' : prov;
//     this.aplicarFiltros();
//   }

//   limpiarBusqueda() {
//     this.terminoBusqueda = '';
//     this.categoriaSeleccionada = '';
//     this.proveedorSeleccionado = '';
//     this.precioMin = null;
//     this.precioMax = null;
//     this.aplicarFiltros();
//   }

//   aplicarFiltros() {
//     let resultado = [...this.productosOriginales];

//     if (this.terminoBusqueda.trim()) {
//       const termino = this.terminoBusqueda.toLowerCase().trim();
//       resultado = resultado.filter(p => 
//         p.nombre.toLowerCase().includes(termino) || 
//         (p.categoria && p.categoria.toLowerCase().includes(termino)) ||
//         (p.proveedor && p.proveedor.toLowerCase().includes(termino))
//       );
//     }

//     if (this.categoriaSeleccionada) {
//       resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
//     }

//     if (this.proveedorSeleccionado) {
//       resultado = resultado.filter(p => p.proveedor === this.proveedorSeleccionado);
//     }

//     if (this.precioMin !== null && this.precioMin >= 0) {
//       resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) >= this.precioMin!);
//     }
//     if (this.precioMax !== null && this.precioMax >= 0) {
//       resultado = resultado.filter(p => (p.precio_tarjeta || p.precio) <= this.precioMax!);
//     }

//     switch (this.ordenSeleccionado) {
//       case 'precio_asc': 
//         resultado.sort((a, b) => (a.precio_tarjeta || a.precio) - (b.precio_tarjeta || b.precio)); 
//         break;
//       case 'precio_desc': 
//         resultado.sort((a, b) => (b.precio_tarjeta || b.precio) - (a.precio_tarjeta || a.precio)); 
//         break;
//       case 'nombre_asc': 
//         resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)); 
//         break;
//       case 'nombre_desc': 
//         resultado.sort((a, b) => b.nombre.localeCompare(a.nombre)); 
//         break;
//     }

//     this.productosFiltrados = resultado;
//     this.paginaActual = 1;
//     this.actualizarProductosVisibles();
//   }

//   actualizarProductosVisibles() {
//     const limite = this.paginaActual * this.itemsPorPagina;
//     this.productosVisibles = this.productosFiltrados.slice(0, limite);
//     this.cd.detectChanges();
//   }

//   cargarMas() {
//     this.cargandoMas = true;
//     setTimeout(() => {
//       this.paginaActual++;
//       this.actualizarProductosVisibles();
//       this.cargandoMas = false;
//       this.cd.detectChanges();
//     }, 500); 
//   }

//   abrirModal(producto: any) {
//     this.router.navigate([], {
//       relativeTo: this.route,
//       queryParams: { producto: producto.id },
//       queryParamsHandling: 'merge' 
//     });
//   }

//   cerrarModal() {
//     this.router.navigate([], {
//       relativeTo: this.route,
//       queryParams: { producto: null },
//       queryParamsHandling: 'merge'
//     });
//   }

//   private abrirModalPorId(id: string) {
//     const producto = this.productosOriginales.find(p => p.id.toString() === id.toString());
//     if (producto) {
//       this.productoSeleccionado = producto;
//       this.cantidadModal = this.getCantidadDisponible(producto) > 0 ? 1 : 0;
//       this.actualizarBodyOverflow();
//       this.cd.detectChanges();
//     }
//   }

//   private cerrarModalInterno() {
//     if (this.productoSeleccionado) {
//       this.productoSeleccionado = null;
//       this.actualizarBodyOverflow();
//       this.cd.detectChanges();
//     }
//   }

//   abrirCarrito() {
//     this.isCarritoOpen = true;
//     this.actualizarBodyOverflow();
//   }

//   cerrarCarrito() {
//     this.isCarritoOpen = false;
//     this.actualizarBodyOverflow();
//   }

//   agregarAlCarrito(producto: any, cantidadSeleccionada: number = 1) {
//     if (cantidadSeleccionada <= 0) return; 

//     const stockTotal = producto.stock || 0;
//     const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
//     const cantidadEnCarrito = itemExistente ? itemExistente.cantidad : 0;
    
//     const stockRestante = stockTotal - cantidadEnCarrito;

//     if (cantidadSeleccionada > stockRestante) {
//         if (cantidadEnCarrito > 0) {
//              this.notificationService.error(`Ya tenés ${cantidadEnCarrito} en el carrito. Solo podés agregar ${stockRestante} más.`);
//         } else {
//              this.notificationService.error(`Solo tenemos ${stockTotal} unidades en stock.`);
//         }
//         return;
//     }

//     if (itemExistente) {
//       itemExistente.cantidad += cantidadSeleccionada;
//     } else {
//       this.carrito.push({ producto: producto, cantidad: cantidadSeleccionada });
//     }

//     this.notificationService.success(`Agregaste ${cantidadSeleccionada}x ${producto.nombre} al carrito.`);

//     if (this.productoSeleccionado) {
//       this.cerrarModal(); 
//     }
//   }

//   eliminarDelCarrito(index: number) {
//     this.carrito.splice(index, 1);
//     if (this.carrito.length === 0) {
//         this.cerrarCarrito();
//     }
//   }

//   get cantidadItemsCarrito(): number {
//     return this.carrito.reduce((total, item) => total + item.cantidad, 0);
//   }

//   enviarPedidoWhatsApp() {
//     if (this.carrito.length === 0) return;

//     const numeroWa = '5493401408588'; 
//     let mensaje = '¡Hola Alquimia! Estoy interesado en estos productos:\n\n';

//     this.carrito.forEach((item, index) => {
//       const precioT = item.producto.precio_tarjeta || item.producto.precio;
//       const precioE = item.producto.precio_efectivo || precioT;

//       mensaje += `${index + 1}. *${item.producto.nombre}* (x${item.cantidad})\n`;
//       mensaje += `   💳 Tarjeta: $${precioT * item.cantidad}\n`;
//       mensaje += `   💵 Efectivo: $${precioE * item.cantidad}\n\n`;
//     });

//     mensaje += `*TOTAL*\n`;
//     mensaje += `💳 *Tarjeta:* $${this.totalCarritoTarjeta}\n`;
//     mensaje += `💵 *Efectivo/Transferencia:* $${this.totalCarritoEfectivo}\n\n`;

//     const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
//     window.open(url, '_blank');
//   }

//   consultarPorWhatsApp(producto: any) {
//     const numeroWa = '5493401408588'; 
//     const mensaje = `¡Hola Alquimia! Quería hacer una consulta sobre el producto: *${producto.nombre}*`;
//     const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
//     window.open(url, '_blank');
//   }

//   abrirImagenAmpliada(url: string | undefined) {
//     if (url) {
//       this.imagenAmpliada = url;
//       this.actualizarBodyOverflow();
//     }
//   }

//   cerrarImagenAmpliada() {
//     this.imagenAmpliada = null;
//     this.actualizarBodyOverflow();
//   }

//   trackById(index: number, item: any): number {
//     return item.id;
//   }

//   actualizarBodyOverflow() {
//     if (this.productoSeleccionado || this.isCarritoOpen || this.isFiltrosMobileOpen || this.imagenAmpliada) {
//         document.body.style.overflow = 'hidden';
//     } else {
//         document.body.style.overflow = 'auto';
//     }
//   }

//   abrirFiltrosMobile() {
//     this.isFiltrosMobileOpen = true;
//     this.actualizarBodyOverflow();
//   }

//   cerrarFiltrosMobile() {
//     this.isFiltrosMobileOpen = false;
//     this.actualizarBodyOverflow();
//   }

//   get cantidadFiltrosActivos(): number {
//     let contador = 0;
//     if (this.categoriaSeleccionada) contador++;
//     if (this.proveedorSeleccionado) contador++;
//     if (this.precioMin !== null || this.precioMax !== null) contador++;
//     if (this.terminoBusqueda) contador++;
//     return contador;
//   }
// }

