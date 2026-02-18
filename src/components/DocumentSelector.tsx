import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface DocumentSelectorProps {
  selectedFiles: string[];
  onSelectionChange: (selectedFiles: string[]) => void;
}

const DocumentSelector: React.FC<DocumentSelectorProps> = ({ selectedFiles, onSelectionChange }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from('datasheets')
      .list('public', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      console.error('Error fetching files:', error);
    } else {
      // Filter out folder placeholders if any (usually .emptyFolderPlaceholder)
      const fileNames = data
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => `public/${f.name}`);
      setFiles(fileNames);
    }
    setLoading(false);
  };

  const handleToggleFile = (fileName: string) => {
    const isSelected = selectedFiles.includes(fileName);
    const newSelection = isSelected
      ? selectedFiles.filter((f) => f !== fileName)
      : [...selectedFiles, fileName];
    
    onSelectionChange(newSelection);
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!window.confirm(`Are you sure you want to delete ${fileName.replace('public/', '')}?`)) {
      return;
    }

    try {
      // 1. Delete from Storage
      const { error: storageError } = await supabase.storage
        .from('datasheets')
        .remove([fileName]);

      if (storageError) {
        throw storageError;
      }

      // 2. Delete from Database (documents table)
      // metadata is a JSONB column, we filter by the fileName key inside it
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('metadata->>fileName', fileName);

      if (dbError) {
        throw dbError;
      }

      // 3. Update Local State (files list)
      setFiles((prev) => prev.filter((f) => f !== fileName));
      
      // 4. Update Parent State (selection)
      // If the deleted file was currently selected, we need to unselect it
      if (selectedFiles.includes(fileName)) {
        const newSelection = selectedFiles.filter((f) => f !== fileName);
        onSelectionChange(newSelection);
      }

    } catch (error: any) {
      console.error('Error deleting file:', error);
      alert(`Failed to delete file: ${error.message}`);
    }
  };

  if (loading) return <div>Loading documents...</div>;

  return (
    <div className="document-selector">
      <h3>Select Datasheets to Query</h3>
      {files.length === 0 ? (
        <p>No documents found. Upload some first!</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {files.map((file) => (
            <li key={file} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file)}
                  onChange={() => handleToggleFile(file)}
                  style={{ marginRight: '10px' }}
                />
                {file.replace('public/', '')}
              </label>
              <button
                onClick={() => handleDeleteFile(file)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#ff4d4d',
                  fontSize: '16px',
                  padding: '0 5px',
                }}
                title="Delete file"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={fetchFiles} style={{ marginTop: '10px', fontSize: '12px' }}>
        Refresh List
      </button>
    </div>
  );
};

export default DocumentSelector;
