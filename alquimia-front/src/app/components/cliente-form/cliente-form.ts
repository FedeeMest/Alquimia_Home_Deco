import { Component, inject, OnInit } from '@angular/core';
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

  cargarCliente() {
    this.loading = true;
    // CORREGIDO: getCliente en vez de getById
    this.clienteService.getCliente(this.clienteId!).subscribe({
      next: (res: any) => {
        this.cliente = { ...this.cliente, ...res.data };
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al cargar datos del cliente', 'error');
        this.router.navigate(['/admin/clientes']);
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
        },
        error: (err) => this.manejarError(err)
      });
    } else {
      // CORREGIDO: crearCliente en vez de create
      this.clienteService.crearCliente(this.cliente).subscribe({
        next: () => {
          this.notificationService.show('Cliente creado con éxito', 'success');
          this.router.navigate(['/admin/clientes']);
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