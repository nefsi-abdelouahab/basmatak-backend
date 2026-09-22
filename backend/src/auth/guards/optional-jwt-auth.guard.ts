import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface OptionalAuthRequest {
  headers?: { authorization?: string };
}

/**
 * Used ONLY on `@Public` routes that want to *optionally* authenticate (the
 * media read route): if a `Bearer` token is present it is validated and
 * `req.user` is attached; an absent or invalid token simply leaves the caller
 * anonymous (route continues, `CurrentAccount` yields undefined → services
 * answer 404). Never blocks — earlier sessions' 401 semantics are untouched.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    const header = request.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return true;
    }
    let result: boolean | Promise<boolean> | Observable<boolean>;
    try {
      result = super.canActivate(context);
    } catch {
      return true;
    }
    if (result instanceof Promise) {
      return result.catch(() => true);
    }
    if (result instanceof Observable) {
      return result.pipe(catchError(() => of(true)));
    }
    return result;
  }
}
