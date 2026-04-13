import { Component, ElementRef, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { NotificationService } from '../../services/notification.service';
import { Producto } from '../../Interfaces/producto.interface';

interface ItemAjuste {
  producto: Producto;
  stockSistema: number;
  stockReal: number;
  diferencia: number;
}

@Component({
  selector: 'app-control-stock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-stock.html'
})
export class ControlStockComponent implements OnInit {
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);

  @ViewChild('inputBusqueda') inputBusqueda!: ElementRef;

  pasoActual: number = 1; // 1: Conteo, 2: Confirmación
  
  busqueda: string = '';
  productosCache: Producto[] = [];
  listaAjustes: ItemAjuste[] = [];
  
  cargando: boolean = false;
  guardando: boolean = false;

  ngOnInit() {
    this.cargarProductos();
  }

  cargarProductos() {
    this.cargando = true;
    this.productoService.getAll('', true, 1, 10000).subscribe({
      next: (res) => {
        this.productosCache = res.data;
        this.cargando = false;
        setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
      },
      error: () => {
        this.notificationService.show('Error al cargar la base de datos de productos', 'error');
        this.cargando = false;
      }
    });
  }

  // ==========================================
  // NAVEGACIÓN Y FILTROS
  // ==========================================
  get itemsConDiferencia() {
    return this.listaAjustes.filter(item => item.diferencia !== 0);
  }

  avanzarPaso() {
    if (this.pasoActual === 1) {
        if (this.listaAjustes.length === 0) {
            this.notificationService.show('Agregá al menos un producto para revisar', 'warning');
            return;
        }
        
        // Si todo coincide a la perfección, no hay nada que guardar
        if (this.itemsConDiferencia.length === 0) {
            this.notificationService.show('¡Todo cuadra perfecto! No hay diferencias para ajustar.', 'success');
            this.limpiarTodo();
            return;
        }
        
        this.pasoActual = 2;
    }
  }

  retrocederPaso() {
    if (this.pasoActual === 2) {
        this.pasoActual = 1;
        setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
    }
  }

  // ==========================================
  // LÓGICA DE CONTEO (PASO 1)
  // ==========================================
  buscarYAgregar(event?: any) {
    if (event) event.preventDefault();
    const termino = this.busqueda.trim().toLowerCase();
    if (!termino) return;

    const producto = this.productosCache.find(p => 
      p.codigo_barra === termino || 
      p.codigo_proveedor?.toLowerCase() === termino ||
      p.nombre.toLowerCase().includes(termino) 
    );

    if (producto) {
      const existe = this.listaAjustes.find(item => item.producto.id === producto.id);
      if (existe) {
        this.notificationService.show('Ese producto ya está en la lista de revisión', 'info');
      } else {
        this.listaAjustes.unshift({
          producto: producto,
          stockSistema: producto.stock || 0,
          stockReal: producto.stock || 0, 
          diferencia: 0
        });
      }
      this.busqueda = '';
    } else {
      this.notificationService.show('Producto no encontrado', 'warning');
    }
  }

  recalcularDiferencia(item: ItemAjuste) {
    if (item.stockReal === null || isNaN(item.stockReal) || item.stockReal < 0) {
      item.stockReal = 0;
    }
    item.diferencia = item.stockReal - item.stockSistema;
  }

  quitarDeLista(index: number) {
    this.listaAjustes.splice(index, 1);
  }

  limpiarTodo() {
    this.listaAjustes = [];
    this.busqueda = '';
    this.pasoActual = 1;
    setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
  }

  // ==========================================
  // GUARDADO DEFINITIVO (PASO 2)
  // ==========================================
  guardarAjustes() {
    const payload = this.itemsConDiferencia.map(item => ({
        id: item.producto.id!,
        stock_real: item.stockReal
    }));

    this.guardando = true;
    this.productoService.actualizarStockMasivo(payload).subscribe({
      next: () => {
        this.notificationService.show(`Stock de ${payload.length} producto(s) actualizado correctamente`, 'success');
        this.guardando = false;
        this.cargarProductos(); // Recarga la base para tener el stock fresco
        this.limpiarTodo();
      },
      error: () => {
        this.notificationService.show('Hubo un error al guardar los ajustes', 'error');
        this.guardando = false;
      }
    });
  }
}
// import { Component, ElementRef, ViewChild, inject, OnInit } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { ProductoService } from '../../services/producto.service';
// import { NotificationService } from '../../services/notification.service';
// import { Producto } from '../../Interfaces/producto.interface';

// interface ItemAjuste {
//   producto: Producto;
//   stockSistema: number;
//   stockReal: number;
//   diferencia: number;
//   accion?: 'IGUALAR' | 'IGNORAR'; // NUEVO: Control de decisión
// }

// @Component({
//   selector: 'app-control-stock',
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: './control-stock.html'
// })
// export class ControlStockComponent implements OnInit {
//   private productoService = inject(ProductoService);
//   private notificationService = inject(NotificationService);

//   @ViewChild('inputBusqueda') inputBusqueda!: ElementRef;

//   pasoActual: number = 1; // 1: Conteo, 2: Conciliación, 3: Resolución
  
//   busqueda: string = '';
//   productosCache: Producto[] = [];
//   listaAjustes: ItemAjuste[] = [];
  
//   cargando: boolean = false;
//   guardando: boolean = false;

//   ngOnInit() {
//     this.cargarProductos();
//   }

//   cargarProductos() {
//     this.cargando = true;
//     this.productoService.getAll('', true, 1, 10000).subscribe({
//       next: (res) => {
//         this.productosCache = res.data;
//         this.cargando = false;
//         setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
//       },
//       error: () => {
//         this.notificationService.show('Error al cargar la base de datos de productos', 'error');
//         this.cargando = false;
//       }
//     });
//   }

//   // ==========================================
//   // NAVEGACIÓN ENTRE PASOS
//   // ==========================================
//   get itemsConDiferencia() {
//     return this.listaAjustes.filter(item => item.diferencia !== 0);
//   }

//   avanzarPaso() {
//     if (this.pasoActual === 1) {
//         if (this.listaAjustes.length === 0) {
//             this.notificationService.show('Agregá al menos un producto para revisar', 'warning');
//             return;
//         }
//         this.pasoActual = 2;
//     } 
//     else if (this.pasoActual === 2) {
//         // Si no hay diferencias, no tiene sentido ir al paso 3
//         if (this.itemsConDiferencia.length === 0) {
//             this.notificationService.show('¡Todo cuadra perfecto! No hay ajustes que realizar.', 'success');
//             this.limpiarTodo();
//             return;
//         }
        
//         // Pre-seleccionamos "IGUALAR" por defecto para todos los que tienen diferencias
//         this.itemsConDiferencia.forEach(item => item.accion = 'IGUALAR');
//         this.pasoActual = 3;
//     }
//   }

//   retrocederPaso() {
//     if (this.pasoActual > 1) {
//         this.pasoActual--;
//         if (this.pasoActual === 1) {
//             setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
//         }
//     }
//   }

//   // ==========================================
//   // LÓGICA DE CONTEO (PASO 1)
//   // ==========================================
//   buscarYAgregar(event?: any) {
//     if (event) event.preventDefault();
//     const termino = this.busqueda.trim().toLowerCase();
//     if (!termino) return;

//     const producto = this.productosCache.find(p => 
//       p.codigo_barra === termino || 
//       p.codigo_proveedor?.toLowerCase() === termino ||
//       p.nombre.toLowerCase().includes(termino) 
//     );

//     if (producto) {
//       const existe = this.listaAjustes.find(item => item.producto.id === producto.id);
//       if (existe) {
//         this.notificationService.show('Ese producto ya está en la lista de revisión', 'info');
//       } else {
//         this.listaAjustes.unshift({
//           producto: producto,
//           stockSistema: producto.stock || 0,
//           stockReal: producto.stock || 0, 
//           diferencia: 0
//         });
//       }
//       this.busqueda = '';
//     } else {
//       this.notificationService.show('Producto no encontrado', 'warning');
//     }
//   }

//   recalcularDiferencia(item: ItemAjuste) {
//     if (item.stockReal === null || isNaN(item.stockReal) || item.stockReal < 0) {
//       item.stockReal = 0;
//     }
//     item.diferencia = item.stockReal - item.stockSistema;
//   }

//   quitarDeLista(index: number) {
//     this.listaAjustes.splice(index, 1);
//   }

//   limpiarTodo() {
//     this.listaAjustes = [];
//     this.busqueda = '';
//     this.pasoActual = 1;
//     setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
//   }

//   // ==========================================
//   // GUARDADO DEFINITIVO (PASO 3)
//   // ==========================================
//   guardarAjustes() {
//     // Solo mandamos al backend los que tienen diferencia Y el usuario eligió "IGUALAR"
//     const payload = this.itemsConDiferencia
//       .filter(item => item.accion === 'IGUALAR')
//       .map(item => ({
//         id: item.producto.id!,
//         stock_real: item.stockReal
//       }));

//     if (payload.length === 0) {
//       this.notificationService.show('Ignoraste todas las diferencias. No se guardó nada.', 'info');
//       this.limpiarTodo();
//       return;
//     }

//     this.guardando = true;
//     this.productoService.actualizarStockMasivo(payload).subscribe({
//       next: () => {
//         this.notificationService.show(`Stock de ${payload.length} producto(s) actualizado correctamente`, 'success');
//         this.guardando = false;
//         this.cargarProductos(); // Recarga la base para tener el stock fresco
//         this.limpiarTodo();
//       },
//       error: () => {
//         this.notificationService.show('Hubo un error al guardar los ajustes', 'error');
//         this.guardando = false;
//       }
//     });
//   }
// }