import { localStorage } from './local-storage';

// Export the local storage instance as the database
export const db = localStorage;
export type DrizzleDb = typeof localStorage;