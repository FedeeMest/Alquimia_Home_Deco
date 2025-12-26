import { Component, ElementRef, ViewChild, inject, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
@Component({
  selector: 'app-verificador-precio',
  imports: [CommonModule, FormsModule],
  templateUrl: './verificador-precio.html',
  styleUrl: './verificador-precio.css',
})
export class VerificadorPrecio implements AfterViewInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);

  // Referencia al input para mantener el foco siempre ahí
  @ViewChild('scanInput') scanInput!: ElementRef;

  codigoLeido: string = '';
  producto?: Producto;
  mensaje: string = 'Escanea un código para ver el precio';
  buscando = false;
  error = false;

  ngAfterViewInit() {
    // Al entrar a la pantalla, poner el cursor en el input
    this.enfocarInput();
  }

  // Truco para que si haces clic fuera, el foco vuelva al input (ideal para kioscos)
  mantenerFoco() {
    this.enfocarInput();
  }

  private enfocarInput() {
    this.scanInput?.nativeElement.focus();
  }

  buscar() {
    if (!this.codigoLeido.trim()) return;

    this.buscando = true;
    this.error = false;
    this.producto = undefined; // Limpiamos el anterior mientras busca
    this.mensaje = 'Buscando...';

    const codigoParaBuscar = this.codigoLeido;
    
    // Limpiamos el input INMEDIATAMENTE para el siguiente escaneo
    this.codigoLeido = ''; 

    this.productoService.getAll(codigoParaBuscar).subscribe({
      next: (resp: any) => { // <--- Cambiamos 'productos' por 'resp' (la respuesta completa)
        
        // 1. EXTRAEMOS LA LISTA REAL DEL OBJETO PAGINADO
        const listaProductos = resp.data; 

        // 2. Ahora sí buscamos la coincidencia exacta en esa lista
        const encontrado = listaProductos.find((p: any) => p.codigo_barra === codigoParaBuscar);

        if (encontrado) {
          this.producto = encontrado;
          this.mensaje = '';
        } else {
          this.error = true;
          this.mensaje = 'Producto no encontrado';
        }
        this.buscando = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.error = true;
        this.mensaje = 'Error de conexión';
        this.buscando = false;

        this.cd.detectChanges();
      }
    });
  }
}