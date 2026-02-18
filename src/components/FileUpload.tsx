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
      setMessage('Please select one or more files first!');
      return;
    }

    setUploading(true);
    setMessage(`Uploading ${selectedFiles.length} file(s)...`);

    for (const file of selectedFiles) {
      const { error } = await supabase.storage
        .from('datasheets') // Ensure this bucket exists in Supabase Storage
        .upload(`public/${file.name}`, file);

      if (error) {
        setMessage(`Error uploading ${file.name}: ${error.message}`);
        setUploading(false);
        return; // Stop on first error
      }
    }

    setMessage(`Successfully uploaded all ${selectedFiles.length} files!`);
    setSelectedFiles([]); // Clear the selection after successful upload
    setUploading(false);
    if (onUploadSuccess) onUploadSuccess();
  };

  return (
    <div>
      <h2>Upload Datasheet(s)</h2>
      <input type="file" multiple onChange={handleFileChange} disabled={uploading} />
      <button onClick={handleUpload} disabled={selectedFiles.length === 0 || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      {message && <p>{message}</p>}
      {selectedFiles.length > 0 && !uploading && (
        <div>
          <p>Selected files:</p>
          <ul>
            {selectedFiles.map((file, index) => (
              <li key={index}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
