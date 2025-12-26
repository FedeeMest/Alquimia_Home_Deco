import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Obtener el token del localStorage
  const token = localStorage.getItem('token');

  // 2. Si existe el token, clonamos la petición y le agregamos el header
  if (token) {
    const clonedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(clonedReq);
  }

  // 3. Si no hay token, dejamos pasar la petición tal cual (ej: login)
  return next(req);
};