import axios from 'axios';
import { Document } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const getTripDocuments = async (token: string, tripId: number): Promise<Document[]> => {
  const response = await axios.get<Document[]>(`${API_URL}/api/trips/${tripId}/documents`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const uploadDocument = async (token: string, tripId: number, file: File): Promise<Document> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<Document>(
    `${API_URL}/api/trips/${tripId}/documents`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

export const downloadDocument = async (token: string, documentId: number): Promise<Blob> => {
  const response = await axios.get(`${API_URL}/api/documents/${documentId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: 'blob',
  });
  return response.data;
};

export const deleteDocument = async (token: string, documentId: number): Promise<void> => {
  await axios.delete(`${API_URL}/api/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
