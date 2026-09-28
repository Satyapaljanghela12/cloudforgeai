/**
 * Core domain types shared across the frontend.
 * Mirror the shapes returned by the backend API.
 */

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  language: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  content: string;
  isDirectory: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number]['value'];
