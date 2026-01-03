import { Component, ElementRef, ViewChild, inject, AfterViewInit, ChangeDetectorRef, OnInit, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../services/configuracion.service';
import { ProductoService } from '../../services/producto.service';
import { Producto } from '../../Interfaces/producto.interface';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

@Component({
  selector: 'app-verificador-precio',
  imports: [CommonModule, FormsModule, ZXingScannerModule],
  templateUrl: './verificador-precio.html',
  styleUrl: './verificador-precio.css',
})
export class VerificadorPrecio implements OnInit, AfterViewInit {
  private productoService = inject(ProductoService);
  private cd = inject(ChangeDetectorRef);
  private configuracionService = inject(ConfiguracionService);

  // Referencia al input para mantener el foco siempre ahí
  @ViewChild('scanInput') scanInput!: ElementRef;

  codigoLeido: string = '';
  producto?: Producto;
  mensaje: string = 'Escanea un código para ver el precio';
  buscando = false;
  error = false;

  recargoLocal: number = 0;   
  recargoTarjeta: number = 0; 
  descuentoEfectivo: number = 0;

  mostrarCamara = false;
  formatosAdmitidos = [
    BarcodeFormat.EAN_13, 
    BarcodeFormat.EAN_8, 
    BarcodeFormat.CODE_128, 
    BarcodeFormat.QR_CODE
  ];

  ngOnInit() {
    this.cargarConfiguracion();
  }

  cargarConfiguracion() {
    this.configuracionService.obtener().subscribe({
      next: (config: any) => {
        // Asumiendo que el endpoint devuelve el objeto de configuración directamente
        // Si devuelve un array, usar config[0]
        if (config) {
          // Ajusta estos nombres de propiedad según tu base de datos exacta
          this.recargoLocal = config.porcentaje_local || 0; 
          this.recargoTarjeta = config.porcentaje_tarjeta || 0;
          this.descuentoEfectivo = config.porcentaje_efectivo || 0;
        }
      },
      error: (err) => console.error('Error cargando porcentajes', err)
    });
  }

  ngAfterViewInit() {
    // Al entrar a la pantalla, poner el cursor en el input
    this.enfocarInput();
  }

  // Truco para que si haces clic fuera, el foco vuelva al input (ideal para kioscos)
  mantenerFoco() {
    this.enfocarInput();
  }
  toggleCamara() {
    this.mostrarCamara = !this.mostrarCamara;
    this.mensaje = this.mostrarCamara ? 'Apuntá al código...' : 'Escanea un código para ver el precio';
    
    // Si abrimos cámara, limpiamos el producto anterior para no confundir
    if (this.mostrarCamara) {
      this.producto = undefined;
    } else {
      // Si cerramos, volvemos a enfocar el input
      setTimeout(() => this.enfocarInput(), 100);
    }
  }
  onCodigoEscaneado(codigo: string) {
    this.codigoLeido = codigo;
    this.mostrarCamara = false; // Apagar cámara
    this.buscar(); // Ejecutar búsqueda automáticamente
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
        setTimeout(() => this.enfocarInput(), 100);
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