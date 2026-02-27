import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface DocumentSelectorProps {
  selectedFiles: string[];
  onSelectionChange: (selectedFiles: string[]) => void;
}

const DocumentSelector: React.FC<DocumentSelectorProps> = ({ selectedFiles, onSelectionChange }) => {
  const [files, setFiles] = useState<{ name: string; status: 'ready' | 'processing' }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
    
    // Auto-refresh while any file is still processing
    const interval = setInterval(() => {
      setFiles((prev) => {
        const anyProcessing = prev.some(f => f.status === 'processing');
        if (anyProcessing) {
          fetchFiles(false); // Silent refresh
        }
        return prev;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchFiles = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    try {
      // 1. Fetch files from Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('datasheets')
        .list('public', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (storageError) throw storageError;

      // 2. Fetch unique file names already in the documents table
      // We use RPC or a simple select. Since we have the index, this is efficient.
      const { data: dbData, error: dbError } = await supabase
        .from('documents')
        .select('metadata')
        .not('metadata->>fileName', 'is', null);

      if (dbError) throw dbError;

      // Create a set of processed file names for fast lookup
      const processedSet = new Set(dbData.map(d => d.metadata.fileName));

      // 3. Combine and determine status
      const mappedFiles = (storageData || [])
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const fullName = `public/${f.name}`;
          return {
            name: fullName,
            status: (processedSet.has(fullName) ? 'ready' : 'processing') as 'ready' | 'processing'
          };
        });

      setFiles(mappedFiles);
    } catch (error) {
      console.error('Error indexing files:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleToggleFile = (fileName: string) => {
    const file = files.find(f => f.name === fileName);
    if (file?.status === 'processing') return; // Disable selection for processing files

    const isSelected = selectedFiles.includes(fileName);
    const newSelection = isSelected
      ? selectedFiles.filter((f) => f !== fileName)
      : [...selectedFiles, fileName];
    
    onSelectionChange(newSelection);
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!window.confirm(`CONFIRM DELETION: ${fileName.replace('public/', '')}?`)) {
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
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('metadata->>fileName', fileName);

      if (dbError) {
        throw dbError;
      }

      // 3. Update Local State (files list)
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      
      // 4. Update Parent State (selection)
      if (selectedFiles.includes(fileName)) {
        const newSelection = selectedFiles.filter((f) => f !== fileName);
        onSelectionChange(newSelection);
      }

    } catch (error: any) {
      console.error('Error deleting file:', error);
      alert(`System Error: ${error.message}`);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Scanning storage...</div>;

  return (
    <div className="document-selector">
      <h3 style={{ 
        fontSize: '0.8rem', 
        color: 'var(--text-secondary)', 
        textTransform: 'uppercase', 
        letterSpacing: '0.1em',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
      }}>
        Active Datasheets
      </h3>
      
      {files.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
          No datasheets found. Initiate upload sequence.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map((file) => {
            const isSelected = selectedFiles.includes(file.name);
            const isProcessing = file.status === 'processing';

            return (
              <li key={file.name} style={{ 
                marginBottom: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                border: isSelected ? '1px solid var(--primary-dim)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.7 : 1
              }}>
                <label style={{ 
                  cursor: isProcessing ? 'wait' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  flexGrow: 1,
                  color: isSelected ? 'var(--primary)' : isProcessing ? 'var(--text-secondary)' : 'var(--text-primary)',
                  fontWeight: isSelected ? 600 : 400
                }}>
                  <input
                    type="checkbox"
                    disabled={isProcessing}
                    checked={isSelected}
                    onChange={() => handleToggleFile(file.name)}
                    style={{ marginRight: '10px' }}
                  />
                  {file.name.replace('public/', '')}
                  {isProcessing && (
                    <span style={{ 
                      marginLeft: '10px', 
                      fontSize: '0.65rem', 
                      color: 'var(--primary)',
                      animation: 'pulse 1.5s infinite' 
                    }}>
                      [ANALYZING...]
                    </span>
                  )}
                </label>
                <button
                  onClick={() => handleDeleteFile(file.name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent-error)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    marginLeft: '8px',
                    opacity: 0.8,
                    transition: 'all 0.2s',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.5px'
                  }}
                  title="Delete file"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  [DELETE]
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button 
        onClick={() => fetchFiles(true)} 
        style={{ 
          marginTop: '15px', 
          fontSize: '0.7rem', 
          width: '100%', 
          padding: '0.5rem',
          backgroundColor: 'transparent', 
          border: '1px dashed var(--border-color)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase'
        }}
      >
        REFRESH_INDEX
      </button>
    </div>
  );
};

export default DocumentSelector;