import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductoService } from '../../services/producto.service';
import { NotificationService } from '../../services/notification.service';
import { ConfiguracionService } from '../../services/configuracion.service';

@Component({
  selector: 'app-producto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './producto-form.html',
  styleUrl: './producto-form.css',
})
export class ProductoForm implements OnInit {
  
  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private notificationService = inject(NotificationService);
  private configService = inject(ConfiguracionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Variable del formulario (En el HTML se llamaba 'form', aquí unificamos a 'productoForm')
  productoForm!: FormGroup;
  
  isEditMode = false;
  productId: number | null = null;
  loading = false;

  // --- VARIABLES QUE FALTABAN PARA EL HTML ---
  previewCosto: number = 0;
  previewPrecioBase: number = 0;
  previewEfectivo: number = 0;
  previewTarjeta: number = 0;
  previewTarjetaLocal: number = 0;

  // Dentro de la clase ProductoForm...

categorias = [
  'Cocina',       // Tazas, platos, cubiertos
  'Decoración',   // Floreros, adornos
  'Difusores',    // Tus productos de Orakke
  'Aromas',       // Velas, esencias
  'Iluminación',  // Lámparas
  'Muebles',      // Mesas, sillas
  'Textil',       // Almohadones, mantas
  'Baño',         // Jaboneras, accesorios
  'Jardín',       // Macetas
  'Otros'
];
  tiposAjuste = ['DESCUENTO', 'RECARGO', 'NINGUNO'];

  ngOnInit(): void {
    this.initForm();
    this.suscribirCambios();

    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.productId = +params['id'];
        this.cargarProducto(this.productId);
      } else {
        this.isEditMode = false;
        this.cargarValoresPorDefecto(); 
      }
    });
  }

  cargarValoresPorDefecto() {
    this.configService.obtener().subscribe({
      next: (config) => {
        this.productoForm.patchValue({
          ajuste_efectivo_valor: config.porcentaje_efectivo,
          ajuste_tarjeta_valor: config.porcentaje_tarjeta,
          ajuste_tarjeta_local_valor: config.porcentaje_local,
          ajuste_efectivo_tipo: 'DESCUENTO',
          ajuste_tarjeta_tipo: 'RECARGO',
          ajuste_tarjeta_local_tipo: 'RECARGO',
          tiene_iva: false,
          ganancia: 0
        });
        // IMPORTANTE: Recalcular para que se llenen los previews
        this.calcularPrecios(); 
      },
      error: (err) => console.error('Error config', err)
    });
  }

  initForm() {
    this.productoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      descripcion: [''],
      codigo_barra: [''],
      codigo_proveedor: [''],
      proveedor: ['', Validators.required],
      categoria: ['', Validators.required],
      stock: [0, [Validators.required, Validators.min(0)]],
      stock_minimo: [1, [Validators.required, Validators.min(0)]],
      precio_compra: [0, [Validators.required, Validators.min(0)]],
      tiene_iva: [false],
      ganancia: [0, [Validators.required, Validators.min(0)]],
      
      ajuste_efectivo_tipo: ['DESCUENTO'],
      ajuste_efectivo_valor: [0],
      ajuste_tarjeta_tipo: ['RECARGO'],
      ajuste_tarjeta_valor: [0],
      ajuste_tarjeta_local_tipo: ['RECARGO'],
      ajuste_tarjeta_local_valor: [0],

      precio_venta_base: [{ value: 0, disabled: true }],
      precio_efectivo: [{ value: 0, disabled: true }],
      precio_tarjeta: [{ value: 0, disabled: true }],
      precio_tarjeta_local: [{ value: 0, disabled: true }],
      
      activo: [true]
    });
  }

  suscribirCambios() {
    this.productoForm.valueChanges.subscribe(() => {
       this.calcularPrecios();
    });
  }

  calcularPrecios() {
    const form = this.productoForm.getRawValue();

    // 1. Calcular Costo
    let costo = Number(form.precio_compra) || 0;
    if (form.tiene_iva) {
      costo = costo * 1.21;
    }

    // 2. Calcular Base (CORREGIDO: Usar Margen / División)
    const gananciaPorcentaje = Number(form.ganancia) || 0;
    const porcentajeDecimal = gananciaPorcentaje / 100;
    
    let precioBase = 0;
    
    // Fórmula Excel: Costo / (1 - %Ganancia)
    if (porcentajeDecimal >= 1) {
      precioBase = costo * 2; // Protección
    } else {
      precioBase = costo / (1 - porcentajeDecimal);
    }
    
    // APLICAR REDONDEO EXCEL AL PRECIO BASE
    precioBase = this.redondearComoExcel(precioBase);

    // 3. Calcular Finales (Usando la nueva base redondeada)
    const pEfectivo = this.aplicarRegla(precioBase, form.ajuste_efectivo_tipo, Number(form.ajuste_efectivo_valor));
    const pTarjeta = this.aplicarRegla(precioBase, form.ajuste_tarjeta_tipo, Number(form.ajuste_tarjeta_valor));
    const pLocal = this.aplicarRegla(precioBase, form.ajuste_tarjeta_local_tipo, Number(form.ajuste_tarjeta_local_valor));

    // --- ACTUALIZAMOS LAS VARIABLES VISUALES (PREVIEWS) ---
    this.previewCosto = costo;
    this.previewPrecioBase = precioBase;
    this.previewEfectivo = pEfectivo;
    this.previewTarjeta = pTarjeta;
    this.previewTarjetaLocal = pLocal;

    // 4. Actualizar Formulario
    this.productoForm.patchValue({
      precio_venta_base: precioBase,
      precio_efectivo: pEfectivo,
      precio_tarjeta: pTarjeta,
      precio_tarjeta_local: pLocal
    }, { emitEvent: false });
  }

  aplicarRegla(base: number, tipo: string, valor: number): number {
    if (!valor) return base;
    let resultado = base;
    if (tipo === 'DESCUENTO') resultado = base * (1 - valor / 100);
    if (tipo === 'RECARGO') resultado = base * (1 + valor / 100);
    
    return this.redondearComoExcel(resultado);
  }

  // NUEVA FUNCIÓN DE REDONDEO (Reemplaza a la anterior 'redondear')
  redondearComoExcel(valor: number): number {
    // Redondea hacia arriba al mil más cercano
    return Math.ceil(valor / 1000) * 1000;
  }

  cargarProducto(id: number) {
    this.loading = true;
    this.productoService.getOne(id).subscribe({
      next: (producto) => {
        this.productoForm.patchValue(producto);
        this.calcularPrecios(); // Recalcula las previews con los datos cargados
        this.loading = false;
      },
      error: (err) => {
        this.notificationService.show('Error al cargar producto', 'error');
        this.loading = false;
        this.router.navigate(['/productos']);
      }
    });
  }

  guardarProducto() {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }

    this.loading = true;
    const productoData = this.productoForm.getRawValue();

    if (this.isEditMode && this.productId) {
      this.productoService.update(this.productId, productoData).subscribe({
        next: () => {
          this.notificationService.show('Producto actualizado', 'success');
          this.router.navigate(['/productos']);
        },
        error: () => {
          this.notificationService.show('Error al actualizar', 'error');
          this.loading = false;
        }
      });
    } else {
      this.productoService.create(productoData).subscribe({
        next: () => {
          this.notificationService.show('Producto creado', 'success');
          this.router.navigate(['/productos']);
        },
        error: () => {
          this.notificationService.show('Error al crear', 'error');
          this.loading = false;
        }
      });
    }
  }
}