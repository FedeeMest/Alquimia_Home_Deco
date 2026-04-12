import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info' | 'success';
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private confirmState = new Subject<any>();
  public confirmState$ = this.confirmState.asObservable();

  // Devuelve una Promesa para que sea tan fácil de usar como el confirm() nativo
  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmState.next({
        ...options,
        resolve
      });
    });
  }
}