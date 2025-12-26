import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html'
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false; // Controla el estado del botón

  private authService = inject(AuthService);
  private router = inject(Router);
  private notif = inject(NotificationService);

  onSubmit() {
    if (!this.username || !this.password) return;

    // 1. Bloqueamos el botón
    this.loading = true;

    this.authService.login({ username: this.username, password: this.password })
      .pipe(
        // 2. finalize se ejecuta SIEMPRE al terminar (sea éxito o error)
        finalize(() => {
          // TRUCO: Usamos setTimeout para mover esta acción al final de la cola
          // Esto evita el error NG0100 "ExpressionChangedAfterItHasBeenCheckedError"
          setTimeout(() => {
            this.loading = false; 
          }, 0);
        })
      )
      .subscribe({
        next: () => {
          this.notif.show('Bienvenido!', 'success');
          this.router.navigate(['/productos']);
        },
        error: (err) => {
          console.error('Login fallido:', err);
          // Aquí solo mostramos el mensaje, el desbloqueo lo hace el finalize
          this.notif.show('Credenciales incorrectas', 'error');
        }
      });
  }
}