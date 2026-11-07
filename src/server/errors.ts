/** An error whose message is safe to show to the end user. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST") => new AppError(400, code, message);
export const unauthorized = (message = "Please log in to continue.") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this.") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found.") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const tooMany = (message = "Too many attempts. Please wait a moment and try again.") =>
  new AppError(429, "RATE_LIMITED", message);
