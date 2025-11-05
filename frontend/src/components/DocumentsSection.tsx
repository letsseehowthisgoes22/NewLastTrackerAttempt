import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTripDocuments, uploadDocument, downloadDocument, deleteDocument } from '../api/documents';
import { Document } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Image, FileIcon, Download, Trash2, Upload } from 'lucide-react';

interface DocumentsSectionProps {
  tripId: number;
}

export const DocumentsSection = ({ tripId }: DocumentsSectionProps) => {
  const { token, user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<string>('');

  useEffect(() => {
    fetchDocuments();
  }, [token, tripId]);

  const fetchDocuments = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const data = await getTripDocuments(token, tripId);
      setDocuments(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('File size exceeds 10MB limit');
      return;
    }

    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.doc'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      setUploadError(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      return;
    }

    try {
      setUploading(true);
      setUploadError('');
      setUploadSuccess('');
      const newDocument = await uploadDocument(token, tripId, file);
      setDocuments([newDocument, ...documents]);
      setUploadSuccess('Document uploaded successfully!');
      event.target.value = '';
      setTimeout(() => setUploadSuccess(''), 3000);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!token) return;

    try {
      const blob = await downloadDocument(token, doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download document');
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      await deleteDocument(token, documentId);
      setDocuments(documents.filter(doc => doc.id !== documentId));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete document');
    }
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    } else if (['jpg', 'jpeg', 'png'].includes(extension || '')) {
      return <Image className="h-5 w-5 text-blue-500" />;
    } else {
      return <FileIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canDelete = (doc: Document) => {
    return user?.role === 'admin' || doc.uploaded_by_id === user?.id;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Upload and manage trip-related documents</CardDescription>
          </div>
          <div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
            />
            <Button
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={uploading}
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {uploadError && (
          <Alert variant="destructive">
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        {uploadSuccess && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{uploadSuccess}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3 flex-1">
                  {getFileIcon(doc.filename)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      Uploaded by {doc.uploader_name || 'Unknown'} • {formatDate(doc.uploaded_at)} • {formatFileSize(doc.file_size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(doc)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete(doc) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
