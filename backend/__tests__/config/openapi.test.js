/**
 * Tests for OpenAPI Specification
 */

import { openApiSpec } from '../../config/openapi.js';

describe('OpenAPI Specification', () => {
  describe('Basic Structure', () => {
    test('should have valid OpenAPI version', () => {
      expect(openApiSpec.openapi).toBe('3.0.0');
    });

    test('should have API info', () => {
      expect(openApiSpec.info).toBeDefined();
      expect(openApiSpec.info.title).toBe('Raven Backend API');
      expect(openApiSpec.info.version).toBe('1.0.0');
      expect(openApiSpec.info.description).toBeDefined();
      expect(openApiSpec.info.description.length).toBeGreaterThan(0);
    });

    test('should have contact information', () => {
      expect(openApiSpec.info.contact).toBeDefined();
      expect(openApiSpec.info.contact.name).toBe('Raven API Support');
    });

    test('should have license information', () => {
      expect(openApiSpec.info.license).toBeDefined();
      expect(openApiSpec.info.license.name).toBe('MIT');
    });
  });

  describe('Servers', () => {
    test('should have server configurations', () => {
      expect(openApiSpec.servers).toBeDefined();
      expect(Array.isArray(openApiSpec.servers)).toBe(true);
      expect(openApiSpec.servers.length).toBeGreaterThan(0);
    });

    test('should have development server', () => {
      const devServer = openApiSpec.servers.find(s => s.description === 'Development server');
      expect(devServer).toBeDefined();
      expect(devServer.url).toContain('localhost');
    });

    test('should have default local server', () => {
      const localServer = openApiSpec.servers.find(s => s.description === 'Default local server');
      expect(localServer).toBeDefined();
      expect(localServer.url).toBe('http://localhost:9100');
    });
  });

  describe('Tags', () => {
    test('should have API tags defined', () => {
      expect(openApiSpec.tags).toBeDefined();
      expect(Array.isArray(openApiSpec.tags)).toBe(true);
      expect(openApiSpec.tags.length).toBeGreaterThan(0);
    });

    test('should have Authentication tag', () => {
      const authTag = openApiSpec.tags.find(t => t.name === 'Authentication');
      expect(authTag).toBeDefined();
      expect(authTag.description).toBeDefined();
    });

    test('should have Telemetry tag', () => {
      const telemetryTag = openApiSpec.tags.find(t => t.name === 'Telemetry');
      expect(telemetryTag).toBeDefined();
    });

    test('should have Dashboard tag', () => {
      const dashboardTag = openApiSpec.tags.find(t => t.name === 'Dashboard');
      expect(dashboardTag).toBeDefined();
    });

    test('should have Projects tag', () => {
      const projectsTag = openApiSpec.tags.find(t => t.name === 'Projects');
      expect(projectsTag).toBeDefined();
    });

    test('should have Health tag', () => {
      const healthTag = openApiSpec.tags.find(t => t.name === 'Health');
      expect(healthTag).toBeDefined();
    });
  });

  describe('Components', () => {
    test('should have security schemes', () => {
      expect(openApiSpec.components.securitySchemes).toBeDefined();
      expect(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
    });

    test('should have JWT bearer authentication', () => {
      const bearerAuth = openApiSpec.components.securitySchemes.bearerAuth;
      expect(bearerAuth.type).toBe('http');
      expect(bearerAuth.scheme).toBe('bearer');
      expect(bearerAuth.bearerFormat).toBe('JWT');
    });

    test('should have schema definitions', () => {
      expect(openApiSpec.components.schemas).toBeDefined();
      expect(Object.keys(openApiSpec.components.schemas).length).toBeGreaterThan(0);
    });

    test('should have LoginRequest schema', () => {
      const loginRequest = openApiSpec.components.schemas.LoginRequest;
      expect(loginRequest).toBeDefined();
      expect(loginRequest.type).toBe('object');
      expect(loginRequest.required).toContain('username');
      expect(loginRequest.required).toContain('password');
      expect(loginRequest.properties.username).toBeDefined();
      expect(loginRequest.properties.password).toBeDefined();
    });

    test('should have TelemetryEvent schema', () => {
      const telemetryEvent = openApiSpec.components.schemas.TelemetryEvent;
      expect(telemetryEvent).toBeDefined();
      expect(telemetryEvent.type).toBe('object');
      expect(telemetryEvent.required).toContain('agent');
      expect(telemetryEvent.required).toContain('event');
      expect(telemetryEvent.required).toContain('message');
    });

    test('should have Error schema', () => {
      const errorSchema = openApiSpec.components.schemas.Error;
      expect(errorSchema).toBeDefined();
      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties.error).toBeDefined();
    });
  });

  describe('Paths', () => {
    test('should have path definitions', () => {
      expect(openApiSpec.paths).toBeDefined();
      expect(Object.keys(openApiSpec.paths).length).toBeGreaterThan(0);
    });

    test('should have /auth/login endpoint', () => {
      expect(openApiSpec.paths['/auth/login']).toBeDefined();
      expect(openApiSpec.paths['/auth/login'].post).toBeDefined();
    });

    test('/auth/login should require credentials', () => {
      const loginPost = openApiSpec.paths['/auth/login'].post;
      expect(loginPost.requestBody).toBeDefined();
      expect(loginPost.requestBody.required).toBe(true);
      expect(loginPost.requestBody.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/LoginRequest'
      );
    });

    test('/auth/login should have success and error responses', () => {
      const loginPost = openApiSpec.paths['/auth/login'].post;
      expect(loginPost.responses['200']).toBeDefined();
      expect(loginPost.responses['401']).toBeDefined();
    });

    test('should have /telemetry endpoint', () => {
      expect(openApiSpec.paths['/telemetry']).toBeDefined();
      expect(openApiSpec.paths['/telemetry'].post).toBeDefined();
    });

    test('/telemetry should accept TelemetryEvent', () => {
      const telemetryPost = openApiSpec.paths['/telemetry'].post;
      expect(telemetryPost.requestBody).toBeDefined();
      expect(telemetryPost.requestBody.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/TelemetryEvent'
      );
    });

    test('should have /health endpoint', () => {
      expect(openApiSpec.paths['/health']).toBeDefined();
      expect(openApiSpec.paths['/health'].get).toBeDefined();
    });

    test('/health should return status information', () => {
      const healthGet = openApiSpec.paths['/health'].get;
      expect(healthGet.responses['200']).toBeDefined();
      expect(healthGet.responses['200'].content['application/json'].schema).toBeDefined();
    });

    test('should have /metrics endpoint', () => {
      expect(openApiSpec.paths['/metrics']).toBeDefined();
      expect(openApiSpec.paths['/metrics'].get).toBeDefined();
    });

    test('/metrics should return Prometheus format', () => {
      const metricsGet = openApiSpec.paths['/metrics'].get;
      expect(metricsGet.responses['200'].content['text/plain']).toBeDefined();
    });

    test('should have /api/dashboard-stats endpoint', () => {
      expect(openApiSpec.paths['/api/dashboard-stats']).toBeDefined();
      expect(openApiSpec.paths['/api/dashboard-stats'].get).toBeDefined();
    });

    test('should have /api/projects endpoints', () => {
      expect(openApiSpec.paths['/api/projects']).toBeDefined();
      expect(openApiSpec.paths['/api/projects/{name}']).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('should require bearer auth on protected endpoints', () => {
      const protectedEndpoint = openApiSpec.paths['/api/dashboard-stats'].get;
      expect(protectedEndpoint.security).toBeDefined();
      expect(protectedEndpoint.security[0].bearerAuth).toBeDefined();
    });

    test('/auth/login should not require authentication', () => {
      const loginPost = openApiSpec.paths['/auth/login'].post;
      expect(loginPost.security).toBeUndefined();
    });

    test('/telemetry should not require authentication', () => {
      const telemetryPost = openApiSpec.paths['/telemetry'].post;
      expect(telemetryPost.security).toBeUndefined();
    });
  });

  describe('Response Schemas', () => {
    test('all paths should have response definitions', () => {
      Object.entries(openApiSpec.paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, spec]) => {
          expect(spec.responses).toBeDefined();
          expect(Object.keys(spec.responses).length).toBeGreaterThan(0);
        });
      });
    });

    test('all responses should have descriptions', () => {
      Object.entries(openApiSpec.paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, spec]) => {
          Object.entries(spec.responses).forEach(([code, response]) => {
            expect(response.description).toBeDefined();
            expect(response.description.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('Schema Validation', () => {
    test('all schema references should be valid', () => {
      const validateRefs = obj => {
        if (!obj || typeof obj !== 'object') return;

        if (obj.$ref && typeof obj.$ref === 'string') {
          const refPath = obj.$ref.replace('#/components/schemas/', '');
          expect(openApiSpec.components.schemas[refPath]).toBeDefined();
        }

        Object.values(obj).forEach(value => {
          if (typeof value === 'object') {
            validateRefs(value);
          }
        });
      };

      validateRefs(openApiSpec.paths);
    });

    test('all schemas should have type property', () => {
      Object.entries(openApiSpec.components.schemas).forEach(([name, schema]) => {
        expect(schema.type).toBeDefined();
      });
    });
  });

  describe('API Completeness', () => {
    test('should document key features mentioned in description', () => {
      const description = openApiSpec.info.description.toLowerCase();
      expect(description).toContain('real-time');
      expect(description).toContain('telemetry');
      expect(description).toContain('authentication');
    });

    test('should have sufficient endpoint coverage', () => {
      const pathCount = Object.keys(openApiSpec.paths).length;
      expect(pathCount).toBeGreaterThan(5);
    });

    test('should have multiple HTTP methods documented', () => {
      const methods = new Set();
      Object.values(openApiSpec.paths).forEach(path => {
        Object.keys(path).forEach(method => methods.add(method));
      });

      expect(methods.size).toBeGreaterThan(1);
      expect(methods.has('get')).toBe(true);
      expect(methods.has('post')).toBe(true);
    });
  });
});
