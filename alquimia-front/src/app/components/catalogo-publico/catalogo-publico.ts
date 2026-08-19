import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ProductoService } from '../../services/producto.service';
import { NotificationService } from '../../services/notification.service';
import { Title, Meta } from '@angular/platform-browser';
 
@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit, OnDestroy {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);
  private notificationService = inject(NotificationService);
  
  private router = inject(Router);
  private route = inject(ActivatedRoute);
 
  private title = inject(Title);
  private meta = inject(Meta);
 
  cantidadModal: number = 1;
  imagenAmpliada: string | null = null;
  agregadoExito: boolean = false; 
  
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
  variantesDelProducto: any[] = []; 
  carrito: { producto: any, cantidad: number }[] = [];
  isCarritoOpen: boolean = false;
  isFiltrosMobileOpen: boolean = false;
  private modalAbiertoDesdeCarrito: boolean = false; // NUEVO
 
  private readonly CARRITO_KEY = 'alquimia_carrito'; // NUEVO
 
  ngOnInit() {
 
    // --- NUEVO: SEO y Meta Tags para el Catálogo ---
    this.title.setTitle('Catálogo | Alquimia Home Deco');
    this.meta.updateTag({ name: 'description', content: 'Explorá nuestro catálogo de fragancias, textiles y decoración. Armá tu carrito y hacé tu pedido fácilmente.' });
    
    this.meta.updateTag({ property: 'og:title', content: 'Catálogo | Alquimia Home Deco' });
    this.meta.updateTag({ property: 'og:description', content: 'Explorá nuestro catálogo de fragancias, textiles y decoración. Armá tu carrito y hacé tu pedido fácilmente.' });
    
    // URL de Vercel aplicada acá:
    this.meta.updateTag({ property: 'og:image', content: 'https://alquimia-home-deco.vercel.app/assets/images/hero_house.jpg' });
    this.meta.updateTag({ property: 'og:url', content: 'https://alquimia-home-deco.vercel.app/catalogo' });
    // -----------------------------------------------
    this.cargarCarritoGuardado(); // NUEVO: restauramos antes de traer el catálogo
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
 
  // Se ejecuta automáticamente al salir del componente / cambiar de ruta
  ngOnDestroy() {
    document.body.style.overflow = 'auto';
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
 
  // NUEVO: persistencia del carrito
  private cargarCarritoGuardado() {
    try {
      const guardado = localStorage.getItem(this.CARRITO_KEY);
      if (guardado) {
        this.carrito = JSON.parse(guardado);
      }
    } catch (e) {
      console.error('No se pudo leer el carrito guardado', e);
      this.carrito = [];
    }
  }
 
  private guardarCarrito() {
    try {
      localStorage.setItem(this.CARRITO_KEY, JSON.stringify(this.carrito));
    } catch (e) {
      console.error('No se pudo guardar el carrito', e);
    }
  }
 
  // NUEVO: una vez que llega el catálogo fresco, actualizamos precio/stock
  // de lo que ya estaba en el carrito (restaurado de localStorage), y
  // sacamos del carrito cualquier producto que ya no exista/publique.
  private sincronizarCarritoConCatalogo() {
    if (this.carrito.length === 0) return;
 
    const carritoActualizado: { producto: any, cantidad: number }[] = [];
    this.carrito.forEach(item => {
      const productoActual = this.productosOriginales.find(p => p.id === item.producto.id);
      if (productoActual) {
        const cantidadAjustada = Math.min(item.cantidad, productoActual.stock || 0);
        if (cantidadAjustada > 0) {
          carritoActualizado.push({ producto: productoActual, cantidad: cantidadAjustada });
        }
      }
      // si productoActual no existe más (se dio de baja / se despublicó), se descarta silenciosamente
    });
 
    this.carrito = carritoActualizado;
    this.guardarCarrito();
  }
 
  cargarCatalogo() {
    this.productoService.getPublicCatalog().subscribe({
      next: (res: any) => {
        const data = res.data ? res.data : res; 
        this.productosOriginales = data;
        this.productosFiltrados = [...this.productosOriginales];
        
        this.extraerFiltros(); 
        this.actualizarProductosVisibles();
        this.sincronizarCarritoConCatalogo(); // NUEVO
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
 
  // Nombre real de la categoría "Manteles" tal como está cargada (por si tiene mayúsculas distintas)
  get categoriaManteles(): string | null {
    return this.categoriasDisponibles.find(c => c.toLowerCase().includes('mantel')) || null;
  }
 
  // Acceso rápido al catálogo de manteles (la grilla siempre muestra un card por estampado)
  irACatalogoDeManteles() {
    const cat = this.categoriaManteles;
    if (!cat) return;
    this.categoriaSeleccionada = cat;
    this.aplicarFiltros();
    this.cerrarFiltrosMobile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
 
  // Cuenta cuántos tamaños tiene un estampado (para mostrarlo en el card)
  contarVariantes(producto: any): number {
    if (!producto.grupo_variante) return 1;
    return this.productosOriginales.filter(p => p.grupo_variante === producto.grupo_variante).length;
  }
 
  // Si el filtro activo es la categoría Manteles (útil para simplificar la info que mostramos en la grilla)
  get filtrandoPorManteles(): boolean {
    return !!this.categoriaManteles && this.categoriaSeleccionada === this.categoriaManteles;
  }
 
  // Saca la medida (ej: "- 3,50 X 1,40 MTS") del final del nombre.
  // Genérico: cualquier nombre que termine en "<número> X <número> <unidad opcional>" queda sin esa parte.
  private quitarMedidaDelNombre(nombre: string): string {
    if (!nombre) return nombre;
    return nombre
      .replace(/\s*-?\s*\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\s*(?:mts?\.?|cm\.?|m\.?)?\s*$/i, '')
      .trim();
  }
 
  // Nombre a mostrar en la grilla: cuando estamos filtrando por Manteles, mostramos solo
  // el nombre del estampado, sin la medida (el tamaño se elige adentro del producto).
  nombreEnGrilla(producto: any): string {
    if (this.filtrandoPorManteles) {
      return this.quitarMedidaDelNombre(producto.nombre);
    }
    return producto.nombre;
  }
 
  // De cada grupo de variantes (mismo estampado) elige un representante para mostrar en la grilla.
  // La grilla siempre muestra un solo card por estampado; el tamaño se elige adentro del modal.
  // preferimos uno con stock disponible; si ninguno tiene, mostramos el primero igual
  private agruparPorEstampado(lista: any[]): any[] {
    const representantePorGrupo = new Map<string, any>();
 
    lista.forEach(p => {
      if (!p.grupo_variante) return;
      const actual = representantePorGrupo.get(p.grupo_variante);
      if (!actual) {
        representantePorGrupo.set(p.grupo_variante, p);
      } else if (this.getCantidadDisponible(actual) <= 0 && this.getCantidadDisponible(p) > 0) {
        representantePorGrupo.set(p.grupo_variante, p);
      }
    });
 
    return lista.filter(p => {
      if (!p.grupo_variante) return true;
      return representantePorGrupo.get(p.grupo_variante)?.id === p.id;
    });
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
 
    // La grilla siempre muestra un solo card por estampado (no es configurable)
    resultado = this.agruparPorEstampado(resultado);
 
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
 
  abrirModal(producto: any, origenCarrito: boolean = false) {
    this.modalAbiertoDesdeCarrito = origenCarrito; // NUEVO
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { producto: producto.id },
      queryParamsHandling: 'merge' 
    });
  }
 
  // NUEVO: ver el detalle de un producto desde el carrito
  verDetalleDesdeCarrito(producto: any) {
    this.cerrarCarrito();     // el drawer tiene z-index más alto que el modal, hay que cerrarlo primero
    this.abrirModal(producto, true);
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
      this.agregadoExito = false; 
      this.calcularVariantes(producto);
      this.actualizarBodyOverflow();
      this.cd.detectChanges();
    }
  }
 
private calcularVariantes(producto: any) {
  if (!producto.grupo_variante) {
    this.variantesDelProducto = [];
    return;
  }
  this.variantesDelProducto = this.productosOriginales
    .filter(p => p.grupo_variante === producto.grupo_variante)
    .sort((a, b) => {
      const pa = this.parseTamano(a.tamano);
      const pb = this.parseTamano(b.tamano);
      if (pa.ancho !== pb.ancho) return pa.ancho - pb.ancho;
      return pa.area - pb.area;
    });
}
 
// NUEVO: extrae los números de un string tipo "1.40 x 2.10" para poder ordenar de verdad
private parseTamano(tamano: string | undefined | null): { ancho: number; area: number } {
  if (!tamano) return { ancho: 0, area: 0 };
  const numeros = tamano.match(/\d+[.,]?\d*/g); // encuentra "1.40", "2,10", etc.
  if (!numeros || numeros.length === 0) return { ancho: 0, area: 0 };
 
  const valores = numeros.map(n => parseFloat(n.replace(',', '.')));
  const ancho = valores[0] || 0;
  const alto = valores[1] !== undefined ? valores[1] : ancho; // si no hay segundo número, asume cuadrado
 
  return { ancho, area: ancho * alto };
}
 
// NUEVO: navega a otra variante del mismo estampado sin cerrar el modal
seleccionarVariante(producto: any) {
  if (producto.id === this.productoSeleccionado?.id) return;
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { producto: producto.id },
    queryParamsHandling: 'merge'
  });
}
 
  private cerrarModalInterno() {
  if (this.productoSeleccionado) {
    this.productoSeleccionado = null;
    this.agregadoExito = false; 
    this.variantesDelProducto = [];   // NUEVO
 
    if (this.modalAbiertoDesdeCarrito) {   // NUEVO
      this.modalAbiertoDesdeCarrito = false;
      this.abrirCarrito();
    }
 
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
 
    this.guardarCarrito(); // NUEVO
    this.notificationService.success(`Agregaste ${cantidadSeleccionada}x ${producto.nombre} al carrito.`);
 
    if (this.productoSeleccionado) {
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
    this.guardarCarrito(); // NUEVO
    if (this.carrito.length === 0) {
        this.cerrarCarrito();
    }
  }
 
  // NUEVO: +1 / -1 directo desde el drawer, sin tener que sacar y re-agregar
  cambiarCantidadCarrito(index: number, delta: number) {
    const item = this.carrito[index];
    if (!item) return;
 
    const nuevaCantidad = item.cantidad + delta;
 
    if (nuevaCantidad <= 0) {
      this.eliminarDelCarrito(index);
      return;
    }
 
    const stockTotal = item.producto.stock || 0;
    if (nuevaCantidad > stockTotal) {
      this.notificationService.error(`Solo hay ${stockTotal} unidades disponibles de "${item.producto.nombre}".`);
      return;
    }
 
    item.cantidad = nuevaCantidad;
    this.guardarCarrito();
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