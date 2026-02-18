import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface DocumentSelectorProps {
  onSelectionChange: (selectedFiles: string[]) => void;
}

const DocumentSelector: React.FC<DocumentSelectorProps> = ({ onSelectionChange }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
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
    setSelectedFiles((prev) => {
      const isSelected = prev.includes(fileName);
      const newSelection = isSelected
        ? prev.filter((f) => f !== fileName)
        : [...prev, fileName];
      
      onSelectionChange(newSelection);
      return newSelection;
    });
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
            <li key={file} style={{ marginBottom: '8px' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file)}
                  onChange={() => handleToggleFile(file)}
                  style={{ marginRight: '10px' }}
                />
                {file.replace('public/', '')}
              </label>
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
