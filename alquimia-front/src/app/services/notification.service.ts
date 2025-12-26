import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  message: string;
  type: ToastType;
  id: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  // Usamos Signals para manejar el estado reactivo (más moderno y eficiente)
  toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'success') {
    const id = Date.now();
    const newToast: Toast = { message, type, id };
    
    // Agregamos la nueva notificación al array
    this.toasts.update(current => [...current, newToast]);

    // La eliminamos automáticamente después de 3 segundos
    setTimeout(() => {
      this.remove(id);
    }, 3000);
  }

  remove(id: number) {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }
}