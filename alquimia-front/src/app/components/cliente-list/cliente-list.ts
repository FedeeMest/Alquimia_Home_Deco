import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClienteService } from '../../services/cliente.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmService } from '../../services/confirm.service'; 

@Component({
  selector: 'app-cliente-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './cliente-list.html'
})
export class ClienteListComponent implements OnInit {
  private clienteService = inject(ClienteService);
  private notificationService = inject(NotificationService);
  private confirmService = inject(ConfirmService); 

  clientes: any[] = [];
  loading = true;
  
  terminoBusqueda: string = '';
  page: number = 1;
  limit: number = 10;
  total: number = 0;
  totalPages: number = 1;

  ngOnInit() {
    this.cargarClientes();
  }

  cargarClientes() {
    this.loading = true;
    // CORREGIDO: Llamamos a getClientes()
    this.clienteService.getClientes(this.page, this.limit, this.terminoBusqueda).subscribe({
      next: (resp: any) => {
        this.clientes = resp.data;
        this.total = resp.meta?.total || 0;
        this.totalPages = resp.meta?.totalPages || 1;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al cargar clientes', 'error');
        this.loading = false;
      }
    });
  }

  buscar() {
    this.page = 1;
    this.cargarClientes();
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.buscar();
  }

  cambiarPagina(delta: number) {
    const nuevaPagina = this.page + delta;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPages) {
      this.page = nuevaPagina;
      this.cargarClientes();
    }
  }

  async eliminarCliente(id: number, nombre: string) {
    const confirmado = await this.confirmService.ask({
      title: '¿Eliminar Cliente?',
      message: `¿Estás seguro de que deseas eliminar permanentemente a ${nombre}?`,
      confirmText: 'Sí, Eliminar',
      type: 'danger'
    });

    if (!confirmado) return;

    // CORREGIDO: Llamamos a eliminarCliente()
    this.clienteService.eliminarCliente(id).subscribe({
      next: () => {
        this.notificationService.show('Cliente eliminado con éxito', 'success');
        this.cargarClientes();
      },
      error: (err) => {
        console.error(err);
        this.notificationService.show('Error al eliminar cliente', 'error');
      }
    });
  }
}