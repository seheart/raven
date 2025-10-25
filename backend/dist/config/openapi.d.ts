export namespace openApiSpec {
    let openapi: string;
    namespace info {
        let title: string;
        let version: string;
        let description: string;
        namespace contact {
            let name: string;
        }
        namespace license {
            let name_1: string;
            export { name_1 as name };
        }
    }
    let servers: {
        url: string;
        description: string;
    }[];
    let tags: {
        name: string;
        description: string;
    }[];
    namespace components {
        namespace securitySchemes {
            namespace bearerAuth {
                export let type: string;
                export let scheme: string;
                export let bearerFormat: string;
                let description_1: string;
                export { description_1 as description };
            }
        }
        namespace schemas {
            namespace LoginRequest {
                let type_1: string;
                export { type_1 as type };
                export let required: string[];
                export namespace properties {
                    namespace username {
                        let type_2: string;
                        export { type_2 as type };
                        export let example: string;
                    }
                    namespace password {
                        let type_3: string;
                        export { type_3 as type };
                        export let format: string;
                        let example_1: string;
                        export { example_1 as example };
                    }
                }
            }
            namespace LoginResponse {
                let type_4: string;
                export { type_4 as type };
                export namespace properties_1 {
                    namespace token {
                        let type_5: string;
                        export { type_5 as type };
                        let description_2: string;
                        export { description_2 as description };
                    }
                    namespace user {
                        let type_6: string;
                        export { type_6 as type };
                        export namespace properties_2 {
                            export namespace id {
                                let type_7: string;
                                export { type_7 as type };
                            }
                            export namespace username_1 {
                                let type_8: string;
                                export { type_8 as type };
                            }
                            export { username_1 as username };
                            export namespace role {
                                let type_9: string;
                                export { type_9 as type };
                                let _enum: string[];
                                export { _enum as enum };
                            }
                        }
                        export { properties_2 as properties };
                    }
                }
                export { properties_1 as properties };
            }
            namespace TelemetryEvent {
                let type_10: string;
                export { type_10 as type };
                let required_1: string[];
                export { required_1 as required };
                export namespace properties_3 {
                    namespace agent {
                        let type_11: string;
                        export { type_11 as type };
                        let example_2: string;
                        export { example_2 as example };
                        let description_3: string;
                        export { description_3 as description };
                    }
                    namespace event {
                        let type_12: string;
                        export { type_12 as type };
                        let example_3: string;
                        export { example_3 as example };
                        let description_4: string;
                        export { description_4 as description };
                    }
                    namespace message {
                        let type_13: string;
                        export { type_13 as type };
                        let example_4: string;
                        export { example_4 as example };
                        let description_5: string;
                        export { description_5 as description };
                    }
                    namespace file {
                        let type_14: string;
                        export { type_14 as type };
                        let example_5: string;
                        export { example_5 as example };
                        let description_6: string;
                        export { description_6 as description };
                    }
                    namespace lines_changed {
                        let type_15: string;
                        export { type_15 as type };
                        let example_6: number;
                        export { example_6 as example };
                        let description_7: string;
                        export { description_7 as description };
                    }
                    namespace duration_ms {
                        let type_16: string;
                        export { type_16 as type };
                        let example_7: number;
                        export { example_7 as example };
                        let description_8: string;
                        export { description_8 as description };
                    }
                    namespace metadata {
                        let type_17: string;
                        export { type_17 as type };
                        let description_9: string;
                        export { description_9 as description };
                    }
                }
                export { properties_3 as properties };
            }
            namespace TelemetryResponse {
                let type_18: string;
                export { type_18 as type };
                export namespace properties_4 {
                    namespace success {
                        let type_19: string;
                        export { type_19 as type };
                    }
                    namespace event_id {
                        let type_20: string;
                        export { type_20 as type };
                    }
                    namespace session_id {
                        let type_21: string;
                        export { type_21 as type };
                    }
                    namespace project {
                        let type_22: string;
                        export { type_22 as type };
                    }
                }
                export { properties_4 as properties };
            }
            namespace DashboardStats {
                let type_23: string;
                export { type_23 as type };
                export namespace properties_5 {
                    namespace total_events {
                        let type_24: string;
                        export { type_24 as type };
                        let description_10: string;
                        export { description_10 as description };
                    }
                    namespace total_files {
                        let type_25: string;
                        export { type_25 as type };
                        let description_11: string;
                        export { description_11 as description };
                    }
                    namespace total_agents {
                        let type_26: string;
                        export { type_26 as type };
                        let description_12: string;
                        export { description_12 as description };
                    }
                    namespace total_lines_changed {
                        let type_27: string;
                        export { type_27 as type };
                        let description_13: string;
                        export { description_13 as description };
                    }
                    namespace active_sessions {
                        let type_28: string;
                        export { type_28 as type };
                        let description_14: string;
                        export { description_14 as description };
                    }
                    namespace uptime_seconds {
                        let type_29: string;
                        export { type_29 as type };
                        let description_15: string;
                        export { description_15 as description };
                    }
                }
                export { properties_5 as properties };
            }
            namespace Project {
                let type_30: string;
                export { type_30 as type };
                export namespace properties_6 {
                    export namespace name_2 {
                        let type_31: string;
                        export { type_31 as type };
                        let example_8: string;
                        export { example_8 as example };
                    }
                    export { name_2 as name };
                    export namespace path {
                        let type_32: string;
                        export { type_32 as type };
                        let example_9: string;
                        export { example_9 as example };
                    }
                    export namespace active {
                        let type_33: string;
                        export { type_33 as type };
                    }
                    export namespace lastActivity {
                        let type_34: string;
                        export { type_34 as type };
                        let format_1: string;
                        export { format_1 as format };
                    }
                }
                export { properties_6 as properties };
            }
            namespace Trigger {
                let type_35: string;
                export { type_35 as type };
                let required_2: string[];
                export { required_2 as required };
                export namespace properties_7 {
                    export namespace id_1 {
                        let type_36: string;
                        export { type_36 as type };
                    }
                    export { id_1 as id };
                    export namespace name_3 {
                        let type_37: string;
                        export { type_37 as type };
                        let example_10: string;
                        export { example_10 as example };
                    }
                    export { name_3 as name };
                    export namespace condition {
                        let type_38: string;
                        export { type_38 as type };
                        let example_11: string;
                        export { example_11 as example };
                    }
                    export namespace action {
                        let type_39: string;
                        export { type_39 as type };
                        let example_12: string;
                        export { example_12 as example };
                    }
                    export namespace enabled {
                        let type_40: string;
                        export { type_40 as type };
                        let _default: boolean;
                        export { _default as default };
                    }
                }
                export { properties_7 as properties };
            }
            namespace Error {
                let type_41: string;
                export { type_41 as type };
                export namespace properties_8 {
                    namespace error {
                        let type_42: string;
                        export { type_42 as type };
                        let description_16: string;
                        export { description_16 as description };
                    }
                    namespace statusCode {
                        let type_43: string;
                        export { type_43 as type };
                        let description_17: string;
                        export { description_17 as description };
                    }
                    namespace timestamp {
                        let type_44: string;
                        export { type_44 as type };
                        let format_2: string;
                        export { format_2 as format };
                    }
                }
                export { properties_8 as properties };
            }
        }
    }
    let paths: {
        '/auth/login': {
            post: {
                tags: string[];
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        'application/json': {
                            schema: {
                                $ref: string;
                            };
                        };
                    };
                };
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    401: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        '/auth/me': {
            get: {
                tags: string[];
                summary: string;
                security: {
                    bearerAuth: never[];
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    properties: {
                                        id: {
                                            type: string;
                                        };
                                        username: {
                                            type: string;
                                        };
                                        role: {
                                            type: string;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    401: {
                        description: string;
                    };
                };
            };
        };
        '/telemetry': {
            post: {
                tags: string[];
                summary: string;
                description: string;
                requestBody: {
                    required: boolean;
                    content: {
                        'application/json': {
                            schema: {
                                $ref: string;
                            };
                        };
                    };
                };
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    400: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        '/api/dashboard-stats': {
            get: {
                tags: string[];
                summary: string;
                description: string;
                security: {
                    bearerAuth: never[];
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        '/api/projects': {
            get: {
                tags: string[];
                summary: string;
                security: {
                    bearerAuth: never[];
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    items: {
                                        $ref: string;
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        '/api/projects/{name}': {
            get: {
                tags: string[];
                summary: string;
                security: {
                    bearerAuth: never[];
                }[];
                parameters: {
                    name: string;
                    in: string;
                    required: boolean;
                    schema: {
                        type: string;
                    };
                    description: string;
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    404: {
                        description: string;
                    };
                };
            };
        };
        '/api/triggers': {
            get: {
                tags: string[];
                summary: string;
                security: {
                    bearerAuth: never[];
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    items: {
                                        $ref: string;
                                    };
                                };
                            };
                        };
                    };
                };
            };
            post: {
                tags: string[];
                summary: string;
                security: {
                    bearerAuth: never[];
                }[];
                requestBody: {
                    required: boolean;
                    content: {
                        'application/json': {
                            schema: {
                                $ref: string;
                            };
                        };
                    };
                };
                responses: {
                    201: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        '/api/control/restart-bridge': {
            post: {
                tags: string[];
                summary: string;
                description: string;
                security: {
                    bearerAuth: never[];
                }[];
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    properties: {
                                        success: {
                                            type: string;
                                        };
                                        message: {
                                            type: string;
                                        };
                                        pid: {
                                            type: string;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    500: {
                        description: string;
                    };
                };
            };
        };
        '/metrics': {
            get: {
                tags: string[];
                summary: string;
                description: string;
                responses: {
                    200: {
                        description: string;
                        content: {
                            'text/plain': {
                                schema: {
                                    type: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        '/metrics/json': {
            get: {
                tags: string[];
                summary: string;
                description: string;
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    properties: {
                                        system: {
                                            type: string;
                                        };
                                        http: {
                                            type: string;
                                        };
                                        telemetry: {
                                            type: string;
                                        };
                                        database: {
                                            type: string;
                                        };
                                        cache: {
                                            type: string;
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        '/health': {
            get: {
                tags: string[];
                summary: string;
                description: string;
                responses: {
                    200: {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    type: string;
                                    properties: {
                                        status: {
                                            type: string;
                                            example: string;
                                        };
                                        uptime: {
                                            type: string;
                                        };
                                        checks: {
                                            type: string;
                                            properties: {
                                                database: {
                                                    type: string;
                                                    enum: string[];
                                                };
                                                telemetry_bridge: {
                                                    type: string;
                                                    enum: string[];
                                                };
                                                file_watcher: {
                                                    type: string;
                                                    enum: string[];
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
}
//# sourceMappingURL=openapi.d.ts.map