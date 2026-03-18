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
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      setMessage('Authentication session not found.');
      setUploading(false);
      return;
    }

    for (const file of selectedFiles) {
      console.log(`[DEBUG] Starting upload for: ${file.name}`);
      setMessage(`Uploading ${file.name}...`);
      
      const { error: uploadError } = await supabase.storage
        .from('datasheets')
        .upload(`public/${file.name}`, file, {
          upsert: true
        });

      if (uploadError) {
        console.error(`[DEBUG] Storage upload failed:`, uploadError);
        setMessage(`Upload failed for ${file.name}: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      console.log(`[DEBUG] Storage upload success: ${file.name}. Triggering API.`);
      // Signal parent to refresh (will show as processing)
      if (onUploadSuccess) onUploadSuccess();

      setMessage(`Analyzing ${file.name}...`);
      
      try {
        const response = await fetch('/api/process-datasheet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            filePath: `public/${file.name}`
          })
        });

        console.log(`[DEBUG] API Response Status: ${response.status}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[DEBUG] API Error:`, errorText);
          throw new Error(errorText || 'Analysis failed');
        }
        
        console.log(`[DEBUG] API Success for ${file.name}`);
        setMessage(`Successfully processed ${file.name}.`);
      } catch (err: any) {
        console.error(`[DEBUG] Lifecycle error:`, err);
        setMessage(`Analysis failed for ${file.name}: ${err.message}`);
        setUploading(false);
        return;
      }

      // Signal parent again (will show as ready)
      if (onUploadSuccess) onUploadSuccess();
    }

    setMessage(`All ${selectedFiles.length} file(s) processed successfully.`);
    setSelectedFiles([]);
    setUploading(false);
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