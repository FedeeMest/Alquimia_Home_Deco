import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClienteService } from '../../services/cliente.service';
import { NotificationService } from '../../services/notification.service';


@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cliente-form.html'
})
export class ClienteFormComponent implements OnInit {
  private clienteService = inject(ClienteService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notificationService = inject(NotificationService);
  private cd = inject(ChangeDetectorRef);

  isEditMode = false;
  clienteId: number | null = null;
  loading = false;

  cliente = {
    nombre: '',
    tipo: 'Minorista',
    telefono: '',
    email: '',
    cuit: '',
    direccion: '',
    notas: ''
  };

  ngOnInit() {
    this.clienteId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.clienteId) {
      this.isEditMode = true;
      this.cargarCliente();
      
    }
  }

  onDocumentoChange(valor: string) {
    this.cliente.cuit = this.formatearDocumento(valor);
  }

  onTelefonoChange(valor: string) {
    this.cliente.telefono = this.formatearTelefono(valor);
  }

  private formatearDocumento(valor: string): string {
    if (!valor) return '';
    let num = valor.replace(/\D/g, ''); // Elimina todo lo que no sea número
    
    // Si tiene 8 dígitos o menos (DNI) -> XX.XXX.XXX
    if (num.length <= 8) {
      return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
    
    // Si tiene más de 8 dígitos (CUIT) -> XX-XXXXXXXX-X
    if (num.length > 11) num = num.substring(0, 11); // Máximo 11 dígitos
    
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

  cargarCliente() {
    this.loading = true;
    // CORREGIDO: getCliente en vez de getById
    this.clienteService.getCliente(this.clienteId!).subscribe({
      next: (res: any) => {
        this.cliente = { ...this.cliente, ...res.data };
        this.cliente.cuit = this.formatearDocumento(this.cliente.cuit);
        this.cliente.telefono = this.formatearTelefono(this.cliente.telefono);
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al cargar datos del cliente', 'error');
        this.router.navigate(['/admin/clientes']);
        this.cd.detectChanges();
      }
    });
  }

  guardar() {
    if (!this.cliente.nombre) {
      this.notificationService.show('El nombre es obligatorio', 'error');
      return;
    }

    this.loading = true;

    if (this.isEditMode) {
      // CORREGIDO: actualizarCliente en vez de update
      this.clienteService.actualizarCliente(this.clienteId!, this.cliente).subscribe({
        next: () => {
          this.notificationService.show('Cliente actualizado con éxito', 'success');
          this.router.navigate(['/admin/clientes']);
          this.cd.detectChanges();
        },
        error: (err) => this.manejarError(err)
      });
    } else {
      // CORREGIDO: crearCliente en vez de create
      this.clienteService.crearCliente(this.cliente).subscribe({
        next: () => {
          this.notificationService.show('Cliente creado con éxito', 'success');
          this.router.navigate(['/admin/clientes']);
          this.cd.detectChanges();
        },
        error: (err) => this.manejarError(err)
      });
    }
  }

  manejarError(err: any) {
    console.error(err);
    this.loading = false;
    this.notificationService.show(err.error?.message || 'Ocurrió un error al guardar', 'error');
  }
}