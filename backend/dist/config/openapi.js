/**
 * OpenAPI 3.0 Specification for Raven Backend
 * Comprehensive API documentation
 */
import { env } from './environment.js';
export const openApiSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Raven Backend API',
        version: '1.0.0',
        description: `
# Raven Backend API

Real-time monitoring and telemetry system for Claude Code development sessions.

## Features
- Real-time telemetry collection from Claude Code agents
- Multi-project workspace support
- Developer activity tracking
- Custom triggers and automation
- Git integration and monitoring
- File system watching with intelligent caching
- Session replay and analytics

## Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

You can obtain a token by calling \`POST /auth/login\`.

Set \`DISABLE_AUTH=true\` in environment variables to disable authentication (development only).
    `,
        contact: {
            name: 'Raven API Support'
        },
        license: {
            name: 'MIT'
        }
    },
    servers: [
        {
            url: `http://localhost:${env.PORT}`,
            description: 'Development server'
        },
        {
            url: 'http://localhost:3030',
            description: 'Default local server'
        }
    ],
    tags: [
        {
            name: 'Authentication',
            description: 'User authentication and authorization'
        },
        {
            name: 'Telemetry',
            description: 'Real-time telemetry event collection'
        },
        {
            name: 'Dashboard',
            description: 'Dashboard statistics and visualizations'
        },
        {
            name: 'Projects',
            description: 'Project management and configuration'
        },
        {
            name: 'Triggers',
            description: 'Custom automation triggers'
        },
        {
            name: 'File System',
            description: 'File watching and tracking'
        },
        {
            name: 'Git',
            description: 'Git integration and monitoring'
        },
        {
            name: 'Sessions',
            description: 'Session management and replay'
        },
        {
            name: 'Control',
            description: 'System control and self-healing'
        },
        {
            name: 'Metrics',
            description: 'Observability metrics (Prometheus-compatible)'
        },
        {
            name: 'Health',
            description: 'Health checks and system status'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'JWT token obtained from /auth/login'
            }
        },
        schemas: {
            // Authentication
            LoginRequest: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', format: 'password', example: 'admin123' }
                }
            },
            LoginResponse: {
                type: 'object',
                properties: {
                    token: { type: 'string', description: 'JWT token' },
                    user: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            username: { type: 'string' },
                            role: { type: 'string', enum: ['admin', 'user'] }
                        }
                    }
                }
            },
            // Telemetry
            TelemetryEvent: {
                type: 'object',
                required: ['agent', 'event', 'message'],
                properties: {
                    agent: { type: 'string', example: 'code-editor', description: 'Agent identifier' },
                    event: { type: 'string', example: 'file_edit', description: 'Event type' },
                    message: { type: 'string', example: 'Edited file.js', description: 'Event message' },
                    file: { type: 'string', example: 'src/app.js', description: 'Related file path' },
                    lines_changed: { type: 'integer', example: 42, description: 'Number of lines changed' },
                    duration_ms: { type: 'integer', example: 1500, description: 'Operation duration' },
                    metadata: { type: 'object', description: 'Additional metadata' }
                }
            },
            TelemetryResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    event_id: { type: 'integer' },
                    session_id: { type: 'string' },
                    project: { type: 'string' }
                }
            },
            // Dashboard
            DashboardStats: {
                type: 'object',
                properties: {
                    total_events: { type: 'integer', description: 'Total events across all projects' },
                    total_files: { type: 'integer', description: 'Total unique files touched' },
                    total_agents: { type: 'integer', description: 'Number of active agents' },
                    total_lines_changed: { type: 'integer', description: 'Total lines of code changed' },
                    active_sessions: { type: 'integer', description: 'Number of active sessions' },
                    uptime_seconds: { type: 'number', description: 'Server uptime' }
                }
            },
            // Project
            Project: {
                type: 'object',
                properties: {
                    name: { type: 'string', example: 'raven' },
                    path: { type: 'string', example: '/Users/seth/projects/raven' },
                    active: { type: 'boolean' },
                    lastActivity: { type: 'string', format: 'date-time' }
                }
            },
            // Trigger
            Trigger: {
                type: 'object',
                required: ['name', 'condition', 'action'],
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', example: 'High error rate alert' },
                    condition: { type: 'string', example: 'event.type === "error"' },
                    action: { type: 'string', example: 'slack_notify' },
                    enabled: { type: 'boolean', default: true }
                }
            },
            // Error
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string', description: 'Error message' },
                    statusCode: { type: 'integer', description: 'HTTP status code' },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            }
        }
    },
    paths: {
        '/auth/login': {
            post: {
                tags: ['Authentication'],
                summary: 'Login and obtain JWT token',
                description: 'Authenticate with username and password to receive a JWT token',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/LoginRequest' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Successful authentication',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LoginResponse' }
                            }
                        }
                    },
                    401: {
                        description: 'Invalid credentials',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/auth/me': {
            get: {
                tags: ['Authentication'],
                summary: 'Get current user information',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'User information',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        username: { type: 'string' },
                                        role: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    401: {
                        description: 'Unauthorized'
                    }
                }
            }
        },
        '/telemetry': {
            post: {
                tags: ['Telemetry'],
                summary: 'Submit telemetry event',
                description: 'Submit a real-time telemetry event from Claude Code agent',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/TelemetryEvent' }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Event recorded successfully',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TelemetryResponse' }
                            }
                        }
                    },
                    400: {
                        description: 'Invalid event data',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' }
                            }
                        }
                    }
                }
            }
        },
        '/api/dashboard-stats': {
            get: {
                tags: ['Dashboard'],
                summary: 'Get aggregated dashboard statistics',
                description: 'Retrieve comprehensive statistics across all projects',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'Dashboard statistics',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/DashboardStats' }
                            }
                        }
                    }
                }
            }
        },
        '/api/projects': {
            get: {
                tags: ['Projects'],
                summary: 'List all projects',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'List of projects',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Project' }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/projects/{name}': {
            get: {
                tags: ['Projects'],
                summary: 'Get project details',
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: 'name',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                        description: 'Project name'
                    }
                ],
                responses: {
                    200: {
                        description: 'Project details',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Project' }
                            }
                        }
                    },
                    404: {
                        description: 'Project not found'
                    }
                }
            }
        },
        '/api/triggers': {
            get: {
                tags: ['Triggers'],
                summary: 'List all triggers',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'List of triggers',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/Trigger' }
                                }
                            }
                        }
                    }
                }
            },
            post: {
                tags: ['Triggers'],
                summary: 'Create new trigger',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Trigger' }
                        }
                    }
                },
                responses: {
                    201: {
                        description: 'Trigger created',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Trigger' }
                            }
                        }
                    }
                }
            }
        },
        '/api/control/restart-bridge': {
            post: {
                tags: ['Control'],
                summary: 'Restart telemetry bridge',
                description: 'Self-healing: Restart the Claude telemetry bridge process',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'Bridge restarted successfully',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean' },
                                        message: { type: 'string' },
                                        pid: { type: 'integer' }
                                    }
                                }
                            }
                        }
                    },
                    500: {
                        description: 'Restart failed'
                    }
                }
            }
        },
        '/metrics': {
            get: {
                tags: ['Metrics'],
                summary: 'Get Prometheus metrics',
                description: 'Prometheus-compatible metrics endpoint',
                responses: {
                    200: {
                        description: 'Metrics in Prometheus format',
                        content: {
                            'text/plain': {
                                schema: { type: 'string' }
                            }
                        }
                    }
                }
            }
        },
        '/metrics/json': {
            get: {
                tags: ['Metrics'],
                summary: 'Get metrics as JSON',
                description: 'JSON formatted metrics for dashboards',
                responses: {
                    200: {
                        description: 'Metrics in JSON format',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        system: { type: 'object' },
                                        http: { type: 'object' },
                                        telemetry: { type: 'object' },
                                        database: { type: 'object' },
                                        cache: { type: 'object' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check endpoint',
                description: 'Get system health status and diagnostics',
                responses: {
                    200: {
                        description: 'System is healthy',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', example: 'healthy' },
                                        uptime: { type: 'number' },
                                        checks: {
                                            type: 'object',
                                            properties: {
                                                database: { type: 'string', enum: ['healthy', 'unhealthy'] },
                                                telemetry_bridge: { type: 'string', enum: ['healthy', 'unhealthy'] },
                                                file_watcher: { type: 'string', enum: ['healthy', 'unhealthy'] }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
//# sourceMappingURL=openapi.js.map