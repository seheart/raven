/**
 * Sanitize file path to prevent directory traversal
 */
export function sanitizeFilePath(filepath: any): string | null;
/**
 * Create validation middleware for a schema
 */
export function validate(schemaName: any, source?: string): (req: any, res: any, next: any) => any;
/**
 * Validate and sanitize file path parameter
 */
export function validateFilePath(req: any, res: any, next: any): void;
export namespace schemas {
    let login: Joi.ObjectSchema<any>;
    let register: Joi.ObjectSchema<any>;
    let changePassword: Joi.ObjectSchema<any>;
    let filePath: Joi.ObjectSchema<any>;
    let fileContent: Joi.ObjectSchema<any>;
    let eventQuery: Joi.ObjectSchema<any>;
    let errorLog: Joi.ObjectSchema<any>;
    let errorQuery: Joi.ObjectSchema<any>;
    let notificationQuery: Joi.ObjectSchema<any>;
    let createNotification: Joi.ObjectSchema<any>;
    let storageCleanup: Joi.ObjectSchema<any>;
    let syncConfig: Joi.ObjectSchema<any>;
    let telemetry: Joi.ObjectSchema<any>;
    let pagination: Joi.ObjectSchema<any>;
    let id: Joi.ObjectSchema<any>;
}
import Joi from 'joi';
//# sourceMappingURL=validation.d.ts.map