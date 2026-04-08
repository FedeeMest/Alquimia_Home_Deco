import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';

@Component({
  selector: 'app-catalogo-publico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogo-publico.html'
})
export class CatalogoPublicoComponent implements OnInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);

  cantidadModal: number = 1;
  imagenAmpliada: string | null = null;
  
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
  mostrarCategorias: boolean = true; // Controla el acordeón

  proveedoresDisponibles: string[] = [];
  proveedorSeleccionado: string = '';
  mostrarProveedores: boolean = false; // Controla el acordeón
  
  precioMin: number | null = null;
  precioMax: number | null = null;
  mostrarPrecio: boolean = false; // Controla el acordeón

  // Modales y Carrito
  productoSeleccionado: any = null;
  carrito: { producto: any, cantidad: number }[] = [];
  isCarritoOpen: boolean = false;

  ngOnInit() {
    this.cargarCatalogo();
  }

  cargarCatalogo() {
    this.productoService.getPublicCatalog().subscribe({
      next: (res: any) => {
        const data = res.data ? res.data : res; 
        this.productosOriginales = data;
        this.productosFiltrados = [...this.productosOriginales];
        
        // Extraemos categorías y ahora también proveedores
        this.extraerFiltros(); 
        
        this.actualizarProductosVisibles();
        this.cargando = false;
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
    const categoriasSet = new Set<string>();
    const proveedoresSet = new Set<string>();
    
    this.productosOriginales.forEach(p => {
      if (p.categoria) categoriasSet.add(p.categoria);
      if (p.proveedor) proveedoresSet.add(p.proveedor);
    });
    
    this.categoriasDisponibles = Array.from(categoriasSet).sort();
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

    // Búsqueda por texto (Busca en nombre, categoría o proveedor)
    if (this.terminoBusqueda.trim()) {
      const termino = this.terminoBusqueda.toLowerCase().trim();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(termino) || 
        (p.categoria && p.categoria.toLowerCase().includes(termino)) ||
        (p.proveedor && p.proveedor.toLowerCase().includes(termino))
      );
    }

    // Filtro Categoría
    if (this.categoriaSeleccionada) {
      resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
    }

    // Filtro Proveedor
    if (this.proveedorSeleccionado) {
      resultado = resultado.filter(p => p.proveedor === this.proveedorSeleccionado);
    }

    // Filtro Rango de Precio
    if (this.precioMin !== null && this.precioMin >= 0) {
      resultado = resultado.filter(p => p.precio >= this.precioMin!);
    }
    if (this.precioMax !== null && this.precioMax >= 0) {
      resultado = resultado.filter(p => p.precio <= this.precioMax!);
    }

    // Ordenamiento
    switch (this.ordenSeleccionado) {
      case 'precio_asc': resultado.sort((a, b) => a.precio - b.precio); break;
      case 'precio_desc': resultado.sort((a, b) => b.precio - a.precio); break;
      case 'nombre_asc': resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)); break;
      case 'nombre_desc': resultado.sort((a, b) => b.nombre.localeCompare(a.nombre)); break;
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
    this.paginaActual++;
    this.actualizarProductosVisibles();
  }

  // --- MODAL PRODUCTO ---
  abrirModal(producto: any) {
    this.productoSeleccionado = producto;
    this.cantidadModal = 1;
    document.body.style.overflow = 'hidden'; 
  }

  cerrarModal() {
    this.productoSeleccionado = null;
    if (!this.isCarritoOpen) {
        document.body.style.overflow = 'auto'; 
    }
  }

  // --- LÓGICA DEL CARRITO ---
  abrirCarrito() {
    this.isCarritoOpen = true;
    document.body.style.overflow = 'hidden';
  }

  cerrarCarrito() {
    this.isCarritoOpen = false;
    if (!this.productoSeleccionado) {
        document.body.style.overflow = 'auto';
    }
  }

  agregarAlCarrito(producto: any, cantidadSeleccionada: number = 1) {
    const stockDisponible = producto.stock || 0;
    const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    
    if (itemExistente) {
      if (itemExistente.cantidad + cantidadSeleccionada > stockDisponible) {
         alert(`Solo quedan ${stockDisponible} unidades disponibles de este producto.`);
         return;
      }
      itemExistente.cantidad += cantidadSeleccionada;
    } else {
      if (cantidadSeleccionada > stockDisponible) {
         alert(`Solo quedan ${stockDisponible} unidades disponibles de este producto.`);
         return;
      }
      this.carrito.push({ producto: producto, cantidad: cantidadSeleccionada });
    }

    if (this.productoSeleccionado) {
      this.cerrarModal();
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

  get totalCarrito(): number {
    return this.carrito.reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
  }

  enviarPedidoWhatsApp() {
    if (this.carrito.length === 0) return;

    const numeroWa = '5493401408588'; 
    let mensaje = '¡Hola Alquimia! Estoy interesado en estos productos:\n\n';

    this.carrito.forEach((item, index) => {
      mensaje += `${index + 1}. *${item.producto.nombre}* (x${item.cantidad}) - $${item.producto.precio * item.cantidad}\n`;
    });

    mensaje += `\n*Total: $${this.totalCarrito}*\n\n`;

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
    }
  }

  cerrarImagenAmpliada() {
    this.imagenAmpliada = null;
  }
}
// import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { ProductoService } from '../../services/producto.service';

// @Component({
//   selector: 'app-catalogo-publico',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './catalogo-publico.html'
// })
// export class CatalogoPublicoComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private cd = inject(ChangeDetectorRef);

//   cantidadModal: number = 1;

//   imagenAmpliada: string | null = null;
  
//   // Listas de datos
//   productosOriginales: any[] = [];
//   productosFiltrados: any[] = [];
  
//   // Paginación
//   productosVisibles: any[] = []; 
//   paginaActual: number = 1;
//   itemsPorPagina: number = 12;

//   categoriasDisponibles: string[] = [];
//   cargando = true;

//   // Filtros
//   terminoBusqueda: string = '';
//   categoriaSeleccionada: string = '';
//   ordenSeleccionado: string = 'defecto';

//   // Modales y Carrito
//   productoSeleccionado: any = null;
  
//   // --- VARIABLES DEL CARRITO ---
//   carrito: { producto: any, cantidad: number }[] = [];
//   isCarritoOpen: boolean = false;

//   ngOnInit() {
//     this.cargarCatalogo();
//   }

//   cargarCatalogo() {
//     this.productoService.getPublicCatalog().subscribe({
//       next: (res: any) => {
//         const data = res.data ? res.data : res; 
//         this.productosOriginales = data;
//         this.productosFiltrados = [...this.productosOriginales];
//         this.extraerCategorias();
//         this.actualizarProductosVisibles();
//         this.cargando = false;
//         this.cd.detectChanges();
//       },
//       error: (err) => {
//         console.error('❌ Error cargando el catálogo:', err);
//         this.cargando = false;
//         this.cd.detectChanges();
//       }
//     });
//   }

//   extraerCategorias() {
//     const categoriasSet = new Set<string>();
//     this.productosOriginales.forEach(p => {
//       if (p.categoria) categoriasSet.add(p.categoria);
//     });
//     this.categoriasDisponibles = Array.from(categoriasSet).sort();
//   }

//   seleccionarCategoria(cat: string) {
//     this.categoriaSeleccionada = this.categoriaSeleccionada === cat ? '' : cat;
//     this.aplicarFiltros();
//   }

//   limpiarBusqueda() {
//     this.terminoBusqueda = '';
//     this.aplicarFiltros();
//   }

//   aplicarFiltros() {
//     let resultado = [...this.productosOriginales];

//     if (this.terminoBusqueda.trim()) {
//       const termino = this.terminoBusqueda.toLowerCase().trim();
//       resultado = resultado.filter(p => 
//         p.nombre.toLowerCase().includes(termino) || 
//         (p.categoria && p.categoria.toLowerCase().includes(termino))
//       );
//     }

//     if (this.categoriaSeleccionada) {
//       resultado = resultado.filter(p => p.categoria === this.categoriaSeleccionada);
//     }

//     switch (this.ordenSeleccionado) {
//       case 'precio_asc': resultado.sort((a, b) => a.precio - b.precio); break;
//       case 'precio_desc': resultado.sort((a, b) => b.precio - a.precio); break;
//       case 'nombre_asc': resultado.sort((a, b) => a.nombre.localeCompare(b.nombre)); break;
//       case 'nombre_desc': resultado.sort((a, b) => b.nombre.localeCompare(a.nombre)); break;
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
//     this.paginaActual++;
//     this.actualizarProductosVisibles();
//   }

//   // --- MODAL PRODUCTO ---
//   /* abrirModal(producto: any) {
//     this.productoSeleccionado = producto;
//     document.body.style.overflow = 'hidden'; 
//   } */

//   abrirModal(producto: any) {
//     this.productoSeleccionado = producto;
//     this.cantidadModal = 1; // Reinicia el contador al abrir
//     document.body.style.overflow = 'hidden'; 
//   }

//   cerrarModal() {
//     this.productoSeleccionado = null;
//     if (!this.isCarritoOpen) {
//         document.body.style.overflow = 'auto'; 
//     }
//   }

//   // --- LÓGICA DEL CARRITO ---
//   abrirCarrito() {
//     this.isCarritoOpen = true;
//     document.body.style.overflow = 'hidden';
//   }

//   cerrarCarrito() {
//     this.isCarritoOpen = false;
//     if (!this.productoSeleccionado) {
//         document.body.style.overflow = 'auto';
//     }
//   }

//   /* agregarAlCarrito(producto: any) {
//     this.carrito.push(producto);
//     // Si agregó el producto desde el modal (vista en detalle), cerramos el modal
//     if (this.productoSeleccionado) {
//       this.cerrarModal();
//     }
//   } */

//   agregarAlCarrito(producto: any, cantidadSeleccionada: number = 1) {
//     // Validamos stock (asumiendo que producto.stock viene del backend)
//     const stockDisponible = producto.stock || 0;
    
//     // Buscamos si el producto ya está en el carrito
//     const itemExistente = this.carrito.find(item => item.producto.id === producto.id);
    
//     if (itemExistente) {
//       if (itemExistente.cantidad + cantidadSeleccionada > stockDisponible) {
//          alert(`Solo quedan ${stockDisponible} unidades disponibles de este producto.`);
//          return;
//       }
//       itemExistente.cantidad += cantidadSeleccionada;
//     } else {
//       if (cantidadSeleccionada > stockDisponible) {
//          alert(`Solo quedan ${stockDisponible} unidades disponibles de este producto.`);
//          return;
//       }
//       this.carrito.push({ producto: producto, cantidad: cantidadSeleccionada });
//     }

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

//   /* get totalCarrito(): number {
//     return this.carrito.reduce((total, prod) => total + prod.precio, 0);
//   } */

//   get totalCarrito(): number {
//     return this.carrito.reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
//   }

//   /* enviarPedidoWhatsApp() {
//     if (this.carrito.length === 0) return;

//     // REEMPLAZÁ CON EL NÚMERO DE ALQUIMIA
//     const numeroWa = '5493401408588'; 
    
//     let mensaje = '¡Hola Alquimia!  Estoy interesado en estos productos:\n\n';

//     this.carrito.forEach((prod, index) => {
//       mensaje += `${index + 1}. *${prod.nombre}* - $${prod.precio}\n`;
//     });

//     mensaje += `\n*Total aproximado: $${this.totalCarrito}*\n\n`;
//     mensaje += '¿Me podrían confirmar si tienen stock?';

//     const url = `https://wa.me/${numeroWa}?text=${encodeURIComponent(mensaje)}`;
//     window.open(url, '_blank');
//   } */

//     enviarPedidoWhatsApp() {
//     if (this.carrito.length === 0) return;

//     const numeroWa = '5493401408588'; 
//     let mensaje = '¡Hola Alquimia! Estoy interesado en estos productos:\n\n';

//     this.carrito.forEach((item, index) => {
//       // Modificamos para mostrar la cantidad multiplicada
//       mensaje += `${index + 1}. *${item.producto.nombre}* (x${item.cantidad}) - $${item.producto.precio * item.cantidad}\n`;
//     });

//     mensaje += `\n*Total: $${this.totalCarrito}*\n\n`;

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
//     }
//   }

//   cerrarImagenAmpliada() {
//     this.imagenAmpliada = null;
//   }
// }

