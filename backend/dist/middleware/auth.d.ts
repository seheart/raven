/**
 * Generate JWT token for user
 */
export function generateToken(user: any): never;
/**
 * Verify JWT token
 */
export function verifyToken(token: any): string | jwt.JwtPayload | null;
/**
 * Authentication middleware - protects routes
 */
export function authenticate(req: any, res: any, next: any): any;
/**
 * Role-based authorization middleware
 */
export function authorize(...allowedRoles: any[]): (req: any, res: any, next: any) => any;
/**
 * WebSocket authentication middleware
 */
export function authenticateSocket(socket: any, next: any): any;
import jwt from 'jsonwebtoken';
//# sourceMappingURL=auth.d.ts.map