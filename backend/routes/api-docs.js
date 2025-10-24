/**
 * API Documentation Routes
 * Swagger UI for OpenAPI specification
 */

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../config/openapi.js';

/**
 * Create API documentation routes
 */
export function createApiDocsRoutes() {
  const router = express.Router();

  // Serve Swagger UI
  router.use('/', swaggerUi.serve);
  router.get('/', swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Raven API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai'
      }
    }
  }));

  // Serve raw OpenAPI spec as JSON
  router.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });

  return router;
}
