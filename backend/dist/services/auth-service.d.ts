export class AuthService {
    constructor(db: any);
    db: any;
    /**
     * Initialize users table
     */
    initializeSchema(): void;
    /**
     * Create default admin user
     */
    createDefaultAdmin(): Promise<void>;
    /**
     * Create a new user
     */
    createUser(username: any, password: any, role?: string): Promise<any>;
    /**
     * Authenticate user with username and password
     */
    authenticate(username: any, password: any): Promise<{
        token: never;
        user: {
            id: any;
            username: any;
            role: any;
        };
    }>;
    /**
     * Change user password
     */
    changePassword(userId: any, oldPassword: any, newPassword: any): Promise<boolean>;
    /**
     * Get user by ID
     */
    getUserById(id: any): any;
    /**
     * Get all users
     */
    getAllUsers(): any;
    /**
     * Update user role
     */
    updateUserRole(userId: any, newRole: any): boolean;
    /**
     * Disable/Enable user account
     */
    setUserActive(userId: any, active: any): boolean;
    /**
     * Delete user
     */
    deleteUser(userId: any): boolean;
}
//# sourceMappingURL=auth-service.d.ts.map