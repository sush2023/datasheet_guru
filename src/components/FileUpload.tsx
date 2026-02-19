import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

interface FileUploadProps {
  onUploadSuccess?: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFiles(Array.from(event.target.files));
      setMessage('');
    } else {
      setSelectedFiles([]);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setMessage('No payload selected.');
      return;
    }

    setUploading(true);
    setMessage(`Uploading ${selectedFiles.length} file(s)...`);

    for (const file of selectedFiles) {
      const { error } = await supabase.storage
        .from('datasheets')
        .upload(`public/${file.name}`, file);

      if (error) {
        setMessage(`Upload failed for ${file.name}: ${error.message}`);
        setUploading(false);
        return;
      }
    }

    setMessage(`Success! ${selectedFiles.length} file(s) uploaded.`);
    setSelectedFiles([]);
    setUploading(false);
    if (onUploadSuccess) onUploadSuccess();
  };

  const handleClear = () => {
    setSelectedFiles([]);
    setMessage('');
  };

  return (
    <div className="file-upload-container">
      {/* Hidden file input, triggered by label */}
      <label 
        className="custom-file-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '1.5rem 1rem',
          border: '2px dashed var(--border-color)',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          backgroundColor: 'var(--bg-input)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.9rem',
          transition: 'all 0.2s',
          marginBottom: '1rem',
          minHeight: '80px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)';
          e.currentTarget.style.color = 'var(--primary)';
          e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.backgroundColor = 'var(--bg-input)';
        }}
      >
        <input 
          type="file" 
          multiple 
          onChange={handleFileChange} 
          disabled={uploading} 
          style={{ display: 'none' }}
        />
        {selectedFiles.length > 0 
          ? <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{selectedFiles.length} file(s) selected</span>
          : <span>Click or Drag PDF Datasheets Here</span>
        }
      </label>

      {selectedFiles.length > 0 && (
        <div className="file-list" style={{ marginBottom: '1rem', width: '100%' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {selectedFiles.map((file, index) => (
              <li key={index} style={{
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                padding: '4px 0',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={handleUpload} 
          disabled={selectedFiles.length === 0 || uploading}
          style={{
            flex: 1,
            opacity: selectedFiles.length === 0 || uploading ? 0.5 : 1
          }}
        >
          {uploading ? 'UPLOADING...' : 'UPLOAD FILES'}
        </button>
        
        {selectedFiles.length > 0 && !uploading && (
          <button 
            onClick={handleClear}
            style={{
              flex: 0,
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '0 1rem'
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
      </div>

      {message && (
        <p style={{ 
          marginTop: '1rem', 
          fontSize: '0.85rem', 
          fontFamily: 'var(--font-mono)', 
          color: message.toLowerCase().includes('failed') ? 'var(--accent-error)' : 'var(--accent-success)' 
        }}>
          {message}
        </p>
      )}
    </div>
  );
};

export default FileUpload;