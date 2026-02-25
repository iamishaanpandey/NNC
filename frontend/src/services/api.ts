import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';


// --- Interfaces ---
export interface Note {
  id: number;
  folder_id: number;
  data: any;
  created_at: string;
}

export interface Folder {
  id: number;
  name: string;
  color: string;
  created_at: string;
  is_favorite?: boolean; // Ensure this is available in the interface
}

export interface Prompt {
  [key: string]: string;
}

// --- Axios Instance ---
export const api = axios.create({ baseURL: API_URL });

// --- User & Folders ---

export const getUserInfo = async () => {
    const response = await api.get('/user');
    return response.data;
};

export const getFolders = async () => {
    const response = await api.get('/folders');
    return response.data;
};

export const createFolder = async (name: string, color: string) => {
    const response = await api.post('/folders', { name, color });
    return response.data;
};

export const deleteFolder = async (id: number) => {
    const response = await api.delete(`/folders/${id}`);
    return response.data;
};

// Updated to PATCH to match backend Swagger UI test
export const toggleFavoriteFolder = async (id: number, isFavorite: boolean) => {
    const response = await api.patch(`/folders/${id}/favorite`, { is_favorite: isFavorite });
    return response.data;
};

// --- Notes Management ---

export const getAllNotes = async () => {
    const response = await api.get('/all_notes');
    return response.data;
};

export const getNotes = async (folderId: number) => {
    const response = await api.get(`/notes/${folderId}`);
    return response.data;
};

export const deleteNote = async (id: number) => {
    const response = await api.delete(`/notes/${id}`);
    return response.data;
};

// --- AI Prompts ---

export const getPrompts = async () => {
    const response = await api.get('/prompts');
    return response.data;
};

export const createPrompt = async (name: string, content: string) => {
    const response = await api.post('/prompts', { name, content });
    return response.data;
};

export const importPrompts = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/import_prompts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.prompts;
};

// --- Analysis Logic ---

export const analyzeContent = async (
  folderId: number,
  mode: 'image' | 'text',
  textContent?: string,
  files?: File[],
  customPrompt?: string,
  merge: boolean = true 
) => {
  const formData = new FormData();
  formData.append('folder_id', folderId.toString());
  formData.append('mode', mode);
  formData.append('merge', merge.toString()); 
  
  if (textContent) {
      formData.append('text_content', textContent);
  }
  
  if (customPrompt) {
      formData.append('custom_prompt', customPrompt);
  }
  
  if (files) {
    files.forEach((file) => {
      formData.append('files', file);
    });
  }

  const response = await api.post('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000 
  });
  return response.data;
};

// --- Exports & Downloads ---

export const generateCsv = async (data: any) => {
    return api.post('/generate_csv', data, { responseType: 'blob' });
};

export const generatePdf = async (noteId: number) => {
  return api.post('/generate_pdf', { note_id: noteId }, { responseType: 'blob' });
};

export const sendEmail = async (noteId: number, mode: 'text' | 'pdf') => {
    return api.post('/send_email', { note_id: noteId, mode });
};