import { Component, ElementRef, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { VentaService, VentaRequest } from '../../services/venta.service';
import { NotificationService } from '../../services/notification.service';
import { Producto } from '../../Interfaces/producto.interface';
import { Router } from '@angular/router';

// Interfaz local para mostrar en la tabla del carrito
interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

@Component({
  selector: 'app-nueva-venta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nueva-venta.html',
})
export class NuevaVentaComponent implements OnInit {
  private productoService = inject(ProductoService);
  private ventaService = inject(VentaService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  @ViewChild('inputBusqueda') inputBusqueda!: ElementRef;

  // Estado
  busqueda = '';
  productosEncontrados: Producto[] = [];
  carrito: ItemCarrito[] = [];
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TARJETA_LOCAL' = 'EFECTIVO';
  total = 0;
  procesando = false;
  datosCliente = {
    nombre: 'Consumidor Final',
    cuit: '',
    direccion: ''
  };
  datosVenta = {
    vendedor: 'Cajero 1', // Podrías sacarlo del login si tuvieras
    cuotas: 1
  };

  ngOnInit() {
    // Foco inicial
    setTimeout(() => this.inputBusqueda?.nativeElement.focus(), 100);
  }

  // 1. Buscar productos mientras escribes
  buscar() {
    if (this.busqueda.length < 2) {
      this.productosEncontrados = [];
      return;
    }

    this.productoService.getAll(this.busqueda).subscribe((resp: any) => {
      this.productosEncontrados = resp.data
    });
  }

  // 2. Agregar al carrito
  agregarAlCarrito(producto: Producto) {
    // Verificar si ya existe para sumar cantidad
    const existe = this.carrito.find(item => item.producto.id === producto.id);

    if (existe) {
      if (existe.cantidad + 1 > producto.stock) {
        this.notificationService.show('No hay suficiente stock', 'error');
        return;
      }
      existe.cantidad++;
    } else {
      if (producto.stock < 1) {
        this.notificationService.show('Producto sin stock', 'error');
        return;
      }
      this.carrito.push({ producto, cantidad: 1, subtotal: 0 });
    }

    this.calcularTotales();
    this.busqueda = '';
    this.productosEncontrados = []; // Limpiar lista de búsqueda
    this.inputBusqueda.nativeElement.focus(); // Volver al input
  }

  // 3. Quitar del carrito
  quitarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    this.calcularTotales();
  }

  // 4. Calcular Totales Dinámicos
  calcularTotales() {
    this.total = 0;
    this.carrito.forEach(item => {
      // Elegir precio según método de pago
      let precio = 0;
      if (this.metodoPago === 'EFECTIVO') {
        precio = item.producto.precio_efectivo || 0;
      } else if (this.metodoPago === 'TARJETA') {
        precio = item.producto.precio_tarjeta || 0; // 15%
      } else {
        precio = item.producto.precio_tarjeta_local || 0; // 6%
      }

      item.subtotal = precio * item.cantidad;
      this.total += item.subtotal;
    });
  }

  // 5. Finalizar Venta
  // 5. Finalizar Venta
  confirmarVenta() {
    if (this.carrito.length === 0) return;

    this.procesando = true;

    // Armamos el objeto completo
    const ventaPayload: VentaRequest = {
      // 1. Datos básicos
      metodo_pago: this.metodoPago,
      items: this.carrito.map(item => ({
        id_producto: item.producto.id!,
        cantidad: item.cantidad
      })),

      // 2. Datos del Cliente
      cliente_nombre: this.datosCliente.nombre,
      cliente_cuit: this.datosCliente.cuit,
      cliente_direccion: this.datosCliente.direccion,

      // 3. Datos de la Venta
      usuario_vendedor: this.datosVenta.vendedor,
      
      // 4. Financieros
      cuotas: (this.metodoPago !== 'EFECTIVO') ? this.datosVenta.cuotas : 1
    };

    this.ventaService.crear(ventaPayload).subscribe({
      next: (response: any) => { // <--- CAMBIO: Recibimos 'response'
        this.notificationService.show(`Venta registrada con éxito`, 'success');
        
        // Como nos vamos de la página, ya no hace falta limpiarTodo(), 
        // pero redirigimos usando el ID que nos devolvió el backend.
        const idVenta = response.id; 
        this.router.navigate(['/ventas', idVenta]); 
      },
      error: (err) => {
        console.error(err);
        // Ajuste para leer el mensaje de error correctamente si viene del backend
        const mensajeError = err.error?.message || 'Error al procesar venta';
        this.notificationService.show(mensajeError, 'error');
        this.procesando = false;
      }
    });
  }

  limpiarTodo() {
    this.carrito = [];
    this.total = 0;
    this.busqueda = '';
    this.procesando = false;
    this.datosCliente = { nombre: 'Consumidor Final', cuit: '', direccion: '' };
    this.datosVenta.cuotas = 1;
    this.metodoPago = 'EFECTIVO'; // Volver al default

    setTimeout(() => this.inputBusqueda.nativeElement.focus(), 100);
  }
}